document.getElementById("backup").onclick = ((ev) => {
  let pass
  while ((pass = prompt("Enter encryption password. This is important. Please don't forget this password. You'll need when you restore your cookies.")) == null || pass.trim() == "");
  chrome.cookies.getAll({}, (cookies) => {
    if (cookies.length > 0) {
      let cookielnk = document.createElement('a')
      let data = btoa(sjcl.encrypt(pass, JSON.stringify(cookies), { ks: 256 }))
      cookielnk.setAttribute('href', "data:text/plain;base64," + data)
      // only using en-GB because it puts the date first
      let date = new Date().toLocaleDateString("en-GB").replace(/\//g, '-')
      let time = new Date().toLocaleTimeString("en-GB")
      cookielnk.setAttribute('download', `cookies-${date}${time}.ckz`)
      cookielnk.click()
      document.getElementById("messages").innerHTML = "Successfully backed up " + cookies.length + " cookies"
    } else {
      alert("No cookies to backup!")
    }
  })
})

document.getElementById("restore").addEventListener('change', handleFileSelect, false);

function handleFileSelect(e) {
  let cookieFile = e.target.files[0];
  if (!cookieFile.name.endsWith('.ckz')) {
    alert("Not a .ckz file. Please select again!")
    return;
  }

  let pass
  while ((pass = prompt("Enter decryption password")) == null || pass.trim() == "");

  let reader = new FileReader();
  reader.readAsText(cookieFile)
  reader.onload = (async (e) => {
    let cookies
    try {
      cookies = JSON.parse(sjcl.decrypt(pass, e.target.result))
    } catch (error) {
      console.log(error)
      alert("Password Incorrect!")
      return;
    }

    let progress = document.getElementById("progress")
    progress.style.display = "block"

    let progressbar = document.getElementById("progressbar")
    progressbar.setAttribute('max', cookies.length)

    let total = 0
    for (const cookie of cookies) {
      let url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path

      if (cookie.hostOnly == true) {
        // https://developer.chrome.com/extensions/cookies#method-set
        // if the cookie is hostOnly, we don't
        // supply the domain because that sets hostOnly to true
        delete cookie.domain
      }
      if (cookie.session == true) {
        // if session is true, then expirationDate
        // needs to be omitted
        delete cookie.expirationDate
      }

      // .set doesn't accepts these
      delete cookie.hostOnly
      delete cookie.session
      // .set wants url
      cookie.url = url
      let c = await new Promise((resolve, reject) => {
        chrome.cookies.set(cookie, resolve)
      })

      if (c == null) {
        console.error("Error while restoring the cookie for the URL " + cookie.url)
        console.error(JSON.stringify(cookie))
        console.error(JSON.stringify(chrome.runtime.lastError))
        document.getElementById("warnings").innerHTML += `<p>Error while restoring the cookie ${cookie.name} for the URL ${cookie.url}</p>`
      } else {
        total++
        progressbar.setAttribute('value', total)
      }
    }
    document.getElementById("messages").innerHTML = `Successfully restored ${total} cookies out of ${cookies.length}`
    progress.style.display = "none"
  })
}