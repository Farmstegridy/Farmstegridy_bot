const originalFetch = global.fetch;
global.fetch = function() {
    let resource = arguments[0];
    let config = arguments[1] || {};
    return originalFetch.call(global, resource, config);
};
fetch('https://google.com').then(res => console.log('FETCH OK')).catch(e => console.error('FETCH ERR', e.message));
