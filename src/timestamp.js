const rawValue = document.getElementById('rawValue')
const unitTag = document.getElementById('unitTag')
const localTime = document.getElementById('localTime')
const utcTime = document.getElementById('utcTime')
const relative = document.getElementById('relative')
const hint = document.getElementById('hint')

let copiedText = ''

window.api.onTimestampResult((data) => {
  rawValue.textContent = data.value
  unitTag.textContent = data.unitLabel
  localTime.textContent = `${data.local} (${data.tz})`
  utcTime.textContent = `${data.utc} UTC`
  relative.textContent = data.relative
  copiedText = data.local
})

hint.addEventListener('click', async () => {
  if (!copiedText) return
  await window.api.copyText(copiedText)
  hint.textContent = '✅ 已复制'
  hint.classList.add('copied')
  setTimeout(() => {
    hint.textContent = '📋 点击复制本地时间'
    hint.classList.remove('copied')
  }, 1500)
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.closeWindow()
})
