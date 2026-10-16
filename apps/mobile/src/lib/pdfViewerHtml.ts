export interface PdfViewerAssets { engine: string; worker: string; runtime: string }
function scriptValue(value: string) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** HTML local: el documento llega por el puente nativo, sin URLs ni credenciales. */
export function buildPdfViewerHtml(assets: PdfViewerAssets, dark: boolean): string {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4, user-scalable=yes">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' blob:; worker-src blob:; child-src blob:; style-src \'unsafe-inline\'; font-src blob: data:; img-src blob: data:; connect-src \'none\';">' +
    '<style>' +
    ':root{color-scheme:light}*{box-sizing:border-box}html,body{height:100%;margin:0;font-family:system-ui,sans-serif;overflow:hidden}' +
    'body{display:flex;flex-direction:column;background:' + (dark ? '#151822' : '#e8ebf2') + ';color:' + (dark ? '#e5e7eb' : '#374151') + '}' +
    '#toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;flex-shrink:0;font-size:12px;border-bottom:1px solid #8893a333}' +
    'button{border:1px solid #8893a355;border-radius:10px;min-width:40px;min-height:40px;background:transparent;color:inherit;font-size:16px}' +
    'button:disabled{opacity:.35}#page-count{flex:1;text-align:center}#fit{font-size:12px;padding:0 12px}' +
    '#viewport{flex:1;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}' +
    '#pages{position:relative;min-width:100%;padding:14px 12px 24px;display:flex;flex-direction:column;align-items:center;gap:16px}' +
    '.page{background:#fff;position:relative;flex-shrink:0;box-shadow:0 2px 8px #0002;overflow:hidden}' +
    '.page canvas{display:block;width:100%;height:100%;background:#fff}.page:empty:after{content:attr(data-label);position:absolute;top:45%;width:100%;text-align:center;color:#9ca3af;font-size:12px}' +
    '#status{padding:16px;text-align:center;font-size:13px}#zoom{min-width:38px;text-align:center}' +
    '</style></head><body>' +
    '<div id="toolbar" role="toolbar" aria-label="Controles del PDF">' +
    '<button id="minus" aria-label="Reducir zoom">−</button><span id="zoom">100%</span>' +
    '<button id="plus" aria-label="Aumentar zoom">+</button><span id="page-count" aria-live="polite">Preparando…</span>' +
    '<button id="fit" aria-label="Ajustar al ancho">Ajustar</button></div>' +
    '<div id="viewport"><div id="status">Abriendo documento…</div><div id="pages"></div></div>' +
    '<script type="module">try {' +
    'const engineUrl=URL.createObjectURL(new Blob([' + scriptValue(assets.engine) + '],{type:"text/javascript"}));' +
    'const workerUrl=URL.createObjectURL(new Blob([' + scriptValue(assets.worker) + '],{type:"text/javascript"}));' +
    'const pdfjs=await import(engineUrl);pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;' +
    assets.runtime +
    '}catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({type:"error",message:String(error?.message||error)}));}</script></body></html>';
}
