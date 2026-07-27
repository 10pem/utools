function buildJsonTree(container, data) {
  container.innerHTML = ''
  container.className = 'json-tree'
  container.appendChild(createEntry(data, null, true, 0))
}

function createEntry(value, key, isLast, depth) {
  const entry = document.createElement('div')
  entry.className = 'json-entry'

  const type = value === null ? 'null' : typeof value
  const isObj = type === 'object' && !Array.isArray(value)
  const isArr = Array.isArray(value)

  if (isObj || isArr) {
    const keys = isObj ? Object.keys(value) : null
    const count = isObj ? keys.length : value.length

    if (count === 0) {
      entry.appendChild(createEmptyLine(key, isLast, depth, isObj))
      return entry
    }

    const indent = depth * 20
    const arrow = span('json-arrow expanded', '▼')

    // Header line
    const header = div('json-line json-toggle')
    header.style.paddingLeft = indent + 'px'
    header.appendChild(arrow)
    appendKeyVal(header, key)

    const ob = span('json-bracket', isObj ? '{' : '[')
    header.appendChild(ob)

    const preview = span('json-preview', ` ${count} ${isObj ? 'keys' : 'items'} `)
    preview.style.display = 'none'
    header.appendChild(preview)

    const cb = span('json-bracket json-collapsed-bracket', isObj ? '}' : ']')
    cb.style.display = 'none'
    header.appendChild(cb)

    appendComma(header, key, isLast)
    entry.appendChild(header)

    // Children
    const children = div('json-children')
    if (isObj) {
      for (let i = 0; i < keys.length; i++) {
        children.appendChild(createEntry(value[keys[i]], keys[i], i === keys.length - 1, depth + 1))
      }
    } else {
      for (let i = 0; i < value.length; i++) {
        children.appendChild(createEntry(value[i], null, i === value.length - 1, depth + 1))
      }
    }
    entry.appendChild(children)

    // Closing line
    const closingLine = div('json-line json-closing-line')
    closingLine.style.paddingLeft = indent + 'px'
    closingLine.appendChild(span('json-bracket', isObj ? '}' : ']'))
    appendComma(closingLine, key, isLast)
    entry.appendChild(closingLine)

    // Toggle handler
    const toggle = () => {
      const expanded = arrow.classList.contains('expanded')
      children.style.display = expanded ? 'none' : ''
      closingLine.style.display = expanded ? 'none' : ''
      preview.style.display = expanded ? '' : 'none'
      cb.style.display = expanded ? '' : 'none'
      arrow.textContent = expanded ? '▶' : '▼'
      arrow.classList.toggle('expanded', !expanded)
      arrow.classList.toggle('collapsed', expanded)
    }
    header.addEventListener('click', toggle)
    closingLine.addEventListener('click', toggle)
  } else {
    entry.appendChild(createPrimitiveLine(value, key, isLast, depth))
  }

  return entry
}

function createPrimitiveLine(value, key, isLast, depth) {
  const line = div('json-line')
  line.style.paddingLeft = (depth * 20) + 'px'
  appendKeyVal(line, key)

  const type = value === null ? 'null' : typeof value
  const cls = type === 'string' ? 'json-string'
    : type === 'number' ? 'json-number'
    : type === 'boolean' ? 'json-boolean'
    : 'json-null'

  const text = type === 'string' ? `"${escapeStr(value)}"` : String(value)
  line.appendChild(span(cls, text))
  appendComma(line, key, isLast)
  return line
}

function createEmptyLine(key, isLast, depth, isObj) {
  const line = div('json-line')
  line.style.paddingLeft = (depth * 20) + 'px'
  appendKeyVal(line, key)
  line.appendChild(span('json-bracket', isObj ? '{}' : '[]'))
  appendComma(line, key, isLast)
  return line
}

function appendKeyVal(parent, key) {
  if (key === null) return
  parent.appendChild(span('json-key', `"${escapeStr(key)}"`))
  parent.appendChild(span('json-sep', ': '))
}

function appendComma(parent, key, isLast) {
  if (!isLast && key !== null) {
    parent.appendChild(span('json-comma', ','))
  }
}

function span(className, text) {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  return el
}

function div(className) {
  const el = document.createElement('div')
  el.className = className
  return el
}

function escapeStr(s) {
  return String(s).replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
}
