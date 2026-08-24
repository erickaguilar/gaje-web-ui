/* =============================================================================
   🧬 GAJE — static/js/chat/markdown.js
   Parser de Markdown, bloques de código interactivos y Cupertino Thought Disclosure.
   ============================================================================= */

window.ChatMarkdown = {
    parse(text) {
        if (!text) return '';

        let cleanText = text.replace(/<\|im_end\|>|<\|endoftext\|>|<end_of_turn>|<\/s>/gi, '').trim();
        let thoughtHtml = '';

        const thinkMatch = cleanText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
        if (thinkMatch) {
            const rawThought = thinkMatch[1].trim();
            if (rawThought) {
                const parsedThought = this.formatMarkdownBody(rawThought);
                thoughtHtml = `
                    <details class="apple-thought-box" open>
                        <summary class="apple-thought-summary">
                            <svg class="y2k-icon thought-icon" style="color: var(--accent-2);"><use href="static/icons/y2k/sprite.svg#i-brain"/></svg>
                            <span class="thought-label">Proceso de Razonamiento</span>
                            <span class="thought-badge">CoT</span>
                            <span class="thought-chevron">›</span>
                        </summary>
                        <div class="apple-thought-content">${parsedThought}</div>
                    </details>
                `;
            }
            cleanText = cleanText.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
        }

        const bodyHtml = this.formatMarkdownBody(cleanText);
        return thoughtHtml ? `${thoughtHtml}<div class="response-body">${bodyHtml}</div>` : `<div class="response-body">${bodyHtml}</div>`;
    },

    formatMarkdownBody(txt) {
        if (!txt) return '';

        // Bloques de código
        txt = txt.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const langLabel = lang ? `<span class="code-lang">${lang.toUpperCase()}</span>` : '<span class="code-lang">CODE</span>';
            return `
                <div class="code-block-wrapper">
                    <div class="code-block-header">
                        ${langLabel}
                        <button class="code-copy-btn" onclick="window.ChatUtils?.copyTextToClipboard(this.closest('.code-block-wrapper').querySelector('code').innerText, this);">
                            <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-copy"/></svg>
                            <span>Copiar</span>
                        </button>
                    </div>
                    <pre><code>${window.ChatUtils.escapeHtml(code.trim())}</code></pre>
                </div>
            `;
        });

        // Encabezados H1, H2, H3, H4
        txt = txt.replace(/^#### (.*$)/gim, '<h4 class="md-heading">$1</h4>');
        txt = txt.replace(/^### (.*$)/gim, '<h3 class="md-heading">$1</h3>');
        txt = txt.replace(/^## (.*$)/gim, '<h2 class="md-heading">$1</h2>');
        txt = txt.replace(/^# (.*$)/gim, '<h1 class="md-heading">$1</h1>');

        // Blockquotes
        txt = txt.replace(/^\> (.*$)/gim, '<blockquote class="md-quote">$1</blockquote>');

        // Código inline
        txt = txt.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // Negritas e itálicas
        txt = txt.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        txt = txt.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Listas
        txt = txt.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
        txt = txt.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
        txt = txt.replace(/<\/ul>\s*<ul>/g, '');

        // Párrafos y saltos de línea
        const paragraphs = txt.split(/\n\n+/).map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('<div class="code-block-wrapper"') || p.startsWith('<ul') || p.startsWith('<details') || p.startsWith('<h') || p.startsWith('<blockquote')) {
                return p;
            }
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).filter(Boolean);

        return paragraphs.join('');
    }
};
