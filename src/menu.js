let pinned = false
const pinBtn = document.getElementById('pinBtn')
const closeBtn = document.getElementById('closeBtn')
const tsSection = document.getElementById('tsSection')
const tsSeconds = document.getElementById('tsSeconds')
const tsMs = document.getElementById('tsMs')

function updateTimestamp() {
  const now = Date.now()
  tsSeconds.textContent = Math.floor(now / 1000)
  tsMs.textContent = `${now} ms`
}
updateTimestamp()
setInterval(updateTimestamp, 1000)

tsSection.addEventListener('click', async () => {
  await window.api.copyText(tsSeconds.textContent)
  tsSection.classList.add('copied')
  setTimeout(() => tsSection.classList.remove('copied'), 1500)
})

pinBtn.addEventListener('click', () => {
  pinned = !pinned
  pinBtn.classList.toggle('active', pinned)
  window.api.togglePin(pinned)
})

closeBtn.addEventListener('click', () => {
  window.api.closeMenu()
})

document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    const action = item.dataset.action
    switch (action) {
      case 'render-html':
        window.api.renderHtml()
        break
      case 'json-format':
        window.api.jsonFormat()
        break
      case 'curl-to-python':
        window.api.curlToPython()
        break
    }
  })
})
