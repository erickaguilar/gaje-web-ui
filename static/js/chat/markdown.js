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
                            <span class="thought-icon">💡</span>
                            <span class="thought-label">Proceso de Razonamiento</span>
                            <span class="thought-badge">CoT</span>
                        </summary>
                        <div class="apple-thought-content">${parsedThought}</div>
                    </details>
                `;
            }
            cleanText = cleanText.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
        }

        const bodyHtml = this.formatMarkdownBody(cleanText);
        return thoughtHtml ? `${thoughtHtml}<div class="response-body">${bodyHtml}</div>` : bodyHtml;
    },

    formatMarkdownBody(txt) {
        if (!txt) return '';

        // Bloques de código
        txt = txt.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const langLabel = lang ? `<span class="code-lang">${lang.toUpperCase()}</span>` : '';
            return `
                <div class="code-block-wrapper">
                    <div class="code-block-header">
                        ${langLabel}
                        <button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('code').innerText); this.innerText='¡Copiado!'; setTimeout(() => this.innerText='Copiar', 1800);">Copiar</button>
                    </div>
                    <pre><code>${window.ChatUtils.escapeHtml(code.trim())}</code></pre>
                </div>
            `;
        });

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
            if (p.startsWith('<div class="code-block-wrapper"') || p.startsWith('<ul') || p.startsWith('<details')) {
                return p;
            }
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).filter(Boolean);

        return paragraphs.join('');
    }
};
