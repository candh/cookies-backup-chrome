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

function handleEncPasswdSubmit(e) {
  e.preventDefault();

  const pass = getEncPasswd();

  chrome.cookies.getAll({}, (cookies) => {
    if (cookies.length > 0) {
      const data = sjcl.encrypt(pass, JSON.stringify(cookies), { ks: 256 });
      // only using en-GB because it puts the date first
      const date = new Date().toLocaleDateString("en-GB").replace(/\//g, "-");
      const time = new Date().toLocaleTimeString("en-GB");
      const filename = `cookies-${date}${time}.ckz`;
      downloadJson(data, filename)
      addToSuccessMessageList(backupSuccessAlert(cookies.length))
    } else {
      alert("No cookies to backup!");
    }
  });
}

let cookieFile;

function handleFileSelect(e) {
  cookieFile = e.target.files[0];
  if (!cookieFile) {
    hideDecPasswordInputBox()
    return;
  }
  if (!cookieFile.name.endsWith(".ckz")) {
    alert("Not a .ckz file. Please select again!");
    return;
  }
  showDecPasswordInputBox()
}

function handleDecPasswdSubmit(e) {
  e.preventDefault();

  const pass = getDecPasswd()
  const reader = new FileReader();
  reader.readAsText(cookieFile);

  reader.onload = async (e) => {
    let cookies;
    try {
      const decrypted = sjcl.decrypt(pass, e.target.result)
      cookies = JSON.parse(decrypted);
    } catch (error) {
      console.log(error);
      alert("Password Incorrect!");
      return;
    }

    // initialize progress bar
    initProgressBar(cookies.length)

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
        addToWarningMessageList(expirationWarning(cookie.name, url))
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
        console.error(chrome.runtime.lastError);
        addToWarningMessageList(unknownErrWarning(cookie.name, cookie.url))
      } else {
        total++;
        updateProgressBar(total)
      }
    }

    // update messages
    addToSuccessMessageList(restoreSuccessAlert(total, cookies.length))

    // hide progress bar
    hideProgressBar()
  };
}

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
    return createWarning(`Cookie ${cookie_name} for the domain ${cookie_url} could not be restored`)
  }
}

function expirationWarning(cookie_name, cookie_url) {
  if (cookie_name && cookie_url) {
    return createWarning(`Cookie ${cookie_name} for the domain ${cookie_url} has expired`)
  }
}

function backupSuccessAlert(totalCookies) {
  return createSuccessAlert(`Successfully backed up <b>${totalCookies.toLocaleString()}</b> cookies!`)
}

function restoreSuccessAlert(restoredCookies, totalCookies) {
  return createSuccessAlert(`Successfully restored <b>${restoredCookies.toLocaleString()}</b> cookies out of <b>${totalCookies.toLocaleString()}</b>`);
}

function showEncPasswordInputBox(e) {
  document.getElementById("enc-passwd").style.display = "inline-block";
  // activate the input box
  document.getElementById("inp-enc-passwd").focus();
}

function showDecPasswordInputBox(e) {
  document.getElementById("dec-passwd").style.display = "inline-block";
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
  const pass = document.getElementById("inp-enc-passwd").value;
  return pass.trim();
}

function getDecPasswd() {
  const pass = document.getElementById("inp-dec-passwd").value;
  return pass.trim();
}

function initProgressBar(maxVal) {
  document.getElementById("progress").style.display = "block";
  document.getElementById("progressbar").setAttribute("max", maxVal);
}

function updateProgressBar(val) {
  document.getElementById("progressbar").setAttribute("value", val);
}

function hideProgressBar() {
  document.getElementById("progressbar").setAttribute("value", 0);
  document.getElementById("progress").style.display = "none";
}

function downloadJson(data, filename) {
  const blob = new Blob([data], { type: "application/json" });
  const cookieLink = document.createElement("a");
  const url = URL.createObjectURL(blob);
  cookieLink.setAttribute("href", url);
  cookieLink.setAttribute("download", filename);
  cookieLink.click();
}
