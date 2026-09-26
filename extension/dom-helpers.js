(() => {
  'use strict';
  // Threads has used both SVG aria-label="Reply" and title="Reply" with a child <title>.
  // Read accessible labels instead of minified classes or path geometry.
  function isReplyControl(element) {
    if (!element) return false;
    const labels = [element.getAttribute('aria-label'), element.getAttribute('title')];
    for (const child of element.querySelectorAll('svg[aria-label],svg[title],svg > title')) {
      labels.push(child.getAttribute('aria-label'), child.getAttribute('title'));
      if (child.localName === 'title') labels.push(child.textContent);
    }
    return labels.some(label => typeof label === 'string' && /^(reply|replies|回覆|回復|回复|留言)$/i.test(label.trim()));
  }
  globalThis.ThreadsAtlasDOM = Object.freeze({isReplyControl});
})();
