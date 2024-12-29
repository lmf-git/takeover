
export function createTemplate(content, { bundle = null, ...state } = {}) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>App</title>
            ${bundle ? `<script type="module" src="/pages/${bundle.main}.js"></script>` : ''}
        </head>
        <body>
            <div id="app">${content}</div>
            <script>window.__INITIAL_STATE__ = ${JSON.stringify(state)}</script>
            <script type="module" src="/client.js"></script>
        </body>
        </html>
    `;
}