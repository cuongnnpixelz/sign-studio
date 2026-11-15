export class SubtitleSync {
  constructor(upperContainer, lowerContainer) {
    this.upperContainer = upperContainer;
    this.lowerContainer = lowerContainer;
    this.tokens = [];
    this.activeIndex = -1;
  }

  element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  setGlossSequence(tokens) {
    this.tokens = tokens || [];
    this.activeIndex = -1;
    this.renderUpper();
  }

  setActiveToken(token, index) {
    this.activeIndex = index - 1;
    this.upperContainer.querySelectorAll('.gloss-token-item').forEach((node, i) => {
      node.classList.toggle('token-active', i === this.activeIndex);
      node.classList.toggle('token-done', i < this.activeIndex);
      node.classList.toggle('token-pending', i > this.activeIndex || this.activeIndex < 0);
      if (i === this.activeIndex) node.setAttribute('aria-current', 'true');
      else node.removeAttribute('aria-current');
    });
  }

  renderUpper() {
    this.upperContainer.replaceChildren();
    if (!this.tokens.length) {
      this.upperContainer.append(this.element('span', 'gloss-quote-placeholder', '“ Chọn câu mẫu hoặc nhập văn bản… ”'));
      return;
    }
    const wrapper = this.element('div', 'video-quote-wrapper', '');
    const tokens = this.element('span', 'quote-tokens', '');
    for (const token of this.tokens) {
      const item = this.element('span', `gloss-token-item token-pending ${token.type === 'FINGERSPELL' ? 'token-fs' : 'token-sign'}`, token.gloss);
      item.title = token.desc || '';
      tokens.append(item);
    }
    wrapper.append(this.element('span', 'quote-mark', '“'), tokens, this.element('span', 'quote-mark', '”'));
    this.upperContainer.append(wrapper);
  }

  setSpeechSubtitles(original, translated, langLabel = 'English') {
    const banner = this.element('div', 'video-sub-banner', '');
    banner.append(
      this.element('span', 'sub-lead', original ? `${langLabel}: ` : 'Sẵn sàng: '),
      this.element('span', 'sub-body', original || 'Chọn câu mẫu, nhập văn bản hoặc bật micro.')
    );
    this.lowerContainer.replaceChildren(banner);
  }

  clear() {
    this.setGlossSequence([]);
    this.setSpeechSubtitles('', '');
  }
}
