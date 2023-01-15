document
  .getElementById("restore")
  .addEventListener("change", handleFileSelect, false);

document
  .getElementById("dec-passwd-form")
  .addEventListener("submit", handleDecPasswdSubmit, false);

document
  .getElementById("enc-passwd-form")
  .addEventListener("submit", handleEncPasswdSubmit, false);

document.getElementById("btn-backup").onclick = showEncPasswordInputBox;

document.getElementById("btn-upload-fallback").onclick = showFallbackCkzInput;

function handleEncPasswdSubmit(e) {
  e.preventDefault();

  const pass = getEncPasswd();

  chrome.cookies.getAll({}, (cookies) => {
    if (cookies.length > 0) {
      const data = sjcl.encrypt(pass, JSON.stringify(cookies), { ks: 256 });
      // only using en-GB because it puts the date first
      const d = new Date()
      const date = d.toLocaleDateString("en-GB").replace(/\//g, "-");
      const time = d.toLocaleTimeString("en-GB").replace(/:/g, "-");
      const filename = `cookies-${date}-${time}.ckz`;
      downloadJson(data, filename)
      backupSuccessAlert(cookies.length)
    } else {
      alert("No cookies to backup!");
    }
  });
}

let cookieFile;

function handleFileSelect(e) {
  cookieFile = e.target.files[0];
  if (!cookieFile || !cookieFile.name.endsWith(".ckz")) {
    alert("Not a .ckz file. Please select again!");
    hideDecPasswordInputBox()
    return;
  }
  hideFallbackCkzButton()
  showDecPasswordInputBox()
}

function handleDecPasswdSubmit(e) {
  e.preventDefault();

  const pass = getDecPasswd()

  getCkzFileDataAsText(async (data) => {
    let cookies;

    try {
      const decrypted = sjcl.decrypt(pass, data)
      cookies = JSON.parse(decrypted);
    } catch (error) {
      console.log(error);
      if (error instanceof sjcl.exception.corrupt) {
        alert("Password incorrect!");
      } else if (error instanceof sjcl.exception.invalid) {
        alert("File is not a valid .ckz file!");
      } else {
        alert("Unknown error!");
      }
      return;
    }

    // initialize progress bar
    initRestoreProgressBar(cookies.length)

    let total = 0;

    // lets save some syscalls by defining it once up here
    // if i call it in the loop, its not gonna be very slow but hey,
    // whose that concerned about that much accuracy of cookie expriation dates
    const epoch = new Date().getTime() / 1000;

    for (const cookie of cookies) {
      let url =
        "http" +
        (cookie.secure ? "s" : "") +
        "://" +
        (cookie.domain.startsWith(".")
          ? cookie.domain.slice(1)
          : cookie.domain) +
        cookie.path;

      if (epoch > cookie.expirationDate) {
        expirationWarning(cookie.name, url)
        continue;
      }

      if (cookie.hostOnly == true) {
        // https://developer.chrome.com/extensions/cookies#method-set
        // if the cookie is hostOnly, we don't
        // supply the domain because that sets hostOnly to true
        delete cookie.domain;
      }
      if (cookie.session == true) {
        // if session is true, then expirationDate
        // needs to be omitted
        delete cookie.expirationDate;
      }

      // .set doesn't accepts these
      delete cookie.hostOnly;
      delete cookie.session;

      // .set wants url
      cookie.url = url;
      let c = await new Promise((resolve, reject) => {
        chrome.cookies.set(cookie, resolve);
      });

      if (c == null) {
        console.error(
          "Error while restoring the cookie for the URL " + cookie.url
        );
        console.error(JSON.stringify(cookie));
        console.error(JSON.stringify(chrome.runtime.lastError));
        unknownErrWarning(cookie.name, cookie.url)
      } else {
        total++;
        updateRestoreProgressBar(total)
      }
    }

    // update messages
    restoreSuccessAlert(total, cookies.length)

    // hide progress bar
    hideRestoreProgressBar()
  })
}

// NOTE: most of these methods are shallow, but i wanted to separate application logic from the DOM
function createWarning(text) {
  const div = document.createElement("div");
  div.classList.add("alert", "alert-warning");
  div.innerHTML = text;
  return div;
}

function createSuccessAlert(text) {
  const div = document.createElement("div");
  div.classList.add("alert", "alert-success");
  div.innerHTML = text;
  return div;
}

function unknownErrWarning(cookie_name, cookie_url) {
  if (cookie_name && cookie_url) {
    addToWarningMessageList(createWarning(`Cookie ${cookie_name} for the domain ${cookie_url} could not be restored`))
  }
}

function expirationWarning(cookie_name, cookie_url) {
  if (cookie_name && cookie_url) {
    addToWarningMessageList(createWarning(`Cookie ${cookie_name} for the domain ${cookie_url} has expired`))
  }
}

function backupSuccessAlert(totalCookies) {
  addToSuccessMessageList(createSuccessAlert(`Successfully backed up <b>${totalCookies.toLocaleString()}</b> cookies!`))
}

function restoreSuccessAlert(restoredCookies, totalCookies) {
  addToSuccessMessageList(createSuccessAlert(`Successfully restored <b>${restoredCookies.toLocaleString()}</b> cookies out of <b>${totalCookies.toLocaleString()}</b>`));
}

function hideBackupButton() {
  document.getElementById("btn-backup").style.display = "none";
}

function showEncPasswordInputBox(e) {
  hideBackupButton()
  document.getElementById("enc-passwd").style.display = "flex";
  // activate the input box
  document.getElementById("inp-enc-passwd").focus();
}

function showDecPasswordInputBox(e) {
  document.getElementById("dec-passwd").style.display = "flex";
  document.getElementById("inp-dec-passwd").focus()
}

function hideDecPasswordInputBox(e) {
  document.getElementById("dec-passwd").style.display = "none";
}

function addToSuccessMessageList(node) {
  document.getElementById("messages").appendChild(node)
}

function addToWarningMessageList(node) {
  document.getElementById("warnings").appendChild(node)
}

function getEncPasswd() {
  return document.getElementById("inp-enc-passwd").value.trim();
}

function getDecPasswd() {
  return document.getElementById("inp-dec-passwd").value.trim();
}

function initRestoreProgressBar(maxVal) {
  document.getElementById("progress").style.display = "block";
  document.getElementById("progressbar").setAttribute("max", maxVal);
}

function updateRestoreProgressBar(val) {
  document.getElementById("progressbar").setAttribute("value", val);
}

function hideRestoreProgressBar() {
  document.getElementById("progressbar").setAttribute("value", 0);
  document.getElementById("progress").style.display = "none";
}

function hideFallbackCkzButton() {
  document.getElementById("btn-upload-fallback").style.display = "none"
}

function showFallbackCkzInput() {
  hideFallbackCkzButton()
  document.getElementById("restore-upload-wrap").style.display = "none"
  // show the fallback
  document.getElementById("restore-using-text-wrap").style.display = "flex"
  document.getElementById("dec-passwd").style.display = "flex";
}

function getCkzFileContentsFromTextarea() {
  return document.getElementById("ckz-textarea").value.trim()
}

function downloadJson(data, filename) {
  const blob = new Blob([data], { type: "application/ckz" });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download({ url: url, filename: filename }, (id) => {
    chrome.downloads.onChanged.addListener((delta) => {
      if (delta?.state?.current == "complete") {
        chrome.downloads.show(id)
      }
    })
  });
}

function getCkzFileDataAsText(cb) {
  if (cookieFile) {
    const reader = new FileReader();
    reader.readAsText(cookieFile);
    reader.onload = (e) => {
      cb(e.target.result);
    }
    reader.onerror = (e) => {
      console.error(e);
      alert("Unknown error while reading the .ckz file!");
    }
  } else {
    cb(getCkzFileContentsFromTextarea())
  }
}
