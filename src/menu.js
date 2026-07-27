let pinned = false
const pinBtn = document.getElementById('pinBtn')
const closeBtn = document.getElementById('closeBtn')

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
    }
  })
})
