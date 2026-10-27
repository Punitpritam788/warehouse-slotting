importScripts('dict.js', 'engine.js', 'session.js');
const handle = WS.makeSession(m => postMessage(m));
onmessage = e => handle(e.data);
