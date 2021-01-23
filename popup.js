document
  .getElementById("restore")
  .addEventListener("change", handleFileSelect, false);

document
  .getElementById("dec-passwd-form")
  .addEventListener("submit", handleDecPasswdSubmit, false);

document
  .getElementById("enc-passwd-form")
  .addEventListener("submit", handleEncPasswdSubmit, false);

document.getElementById("backup").onclick = (ev) => {
  document.getElementById("enc-passwd").style.display = "inline-block";
};

function handleEncPasswdSubmit(e) {
  e.preventDefault();

  let pass = document.getElementById("inp-enc-passwd").value;
  pass = pass.trim();

  chrome.cookies.getAll({}, (cookies) => {
    if (cookies.length > 0) {
      let cookielnk = document.createElement("a");
      let data = btoa(sjcl.encrypt(pass, JSON.stringify(cookies), { ks: 256 }));
      cookielnk.setAttribute("href", "data:text/plain;base64," + data);
      // only using en-GB because it puts the date first
      let date = new Date().toLocaleDateString("en-GB").replace(/\//g, "-");
      let time = new Date().toLocaleTimeString("en-GB");
      cookielnk.setAttribute("download", `cookies-${date}${time}.ckz`);
      cookielnk.click();
      document.getElementById("messages").innerHTML =
        "Successfully backed up " + cookies.length + " cookies";
    } else {
      alert("No cookies to backup!");
    }
  });
}

let cookieFile;

function handleFileSelect(e) {
  cookieFile = e.target.files[0];
  if (!cookieFile.name.endsWith(".ckz")) {
    alert("Not a .ckz file. Please select again!");
    return;
  }
  document.getElementById("dec-passwd").style.display = "inline-block";
}

function handleDecPasswdSubmit(e) {
  e.preventDefault();

  let pass = document.getElementById("inp-dec-passwd").value;
  pass = pass.trim();

  let reader = new FileReader();
  reader.readAsText(cookieFile);
  reader.onload = async (e) => {
    let cookies;
    try {
      cookies = JSON.parse(sjcl.decrypt(pass, e.target.result));
    } catch (error) {
      console.log(error);
      alert("Password Incorrect!");
      return;
    }

    let progress = document.getElementById("progress");
    progress.style.display = "block";

    let progressbar = document.getElementById("progressbar");
    progressbar.setAttribute("max", cookies.length);

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
        document.getElementById(
          "warnings"
        ).innerHTML += `<p>Cookie ${cookie.name} for the domain ${url} has expired</p>`;
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
        document.getElementById(
          "warnings"
        ).innerHTML += `<p>Error while restoring the cookie ${cookie.name} for the URL ${cookie.url}</p>`;
      } else {
        total++;
        progressbar.setAttribute("value", total);
      }
    }

    // update messages
    document.getElementById(
      "messages"
    ).innerHTML = `Successfully restored ${total} cookies out of ${cookies.length}`;

    // hide progress bar
    progress.style.display = "none";
  };
}
