import { NATIVE_LOCAL_PATH } from '../common/utils.js';
import { readNativeSettings } from './nativeSettings.js';

function request(url, onReady, headers, data, onException) {
    headers = headers || {};
    const CHARTSET_RE = /(?:charset|encoding)\s*=\s*['"]? *([\w\-]+)/i;

    fetch(url, {
        method: (data !== undefined) ? "POST" : "GET",
        headers,
        body: data,
    }).then(res => {
        const cs = res.headers.get('content-type') ? res.headers.get('content-type').match(CHARTSET_RE) : [];

        return Promise.all([
            Promise.resolve(cs && cs.length > 1 ? cs[1] : "utf-8"),
            res.arrayBuffer()
        ])
    }).then(res => {
        const decoder = new TextDecoder(res[0]);
        const content = decoder.decode(res[1]);
        onReady(content);
    }).catch(exp => {
        onException && onException(exp);
    });
}

function dictFromArray(arry, val) {
    var dict = {};
    arry.forEach(function(h) {
        dict[h] = val;
    });
    return dict;
}

function extendObject(target, ss) {
    for (var k in ss) {
        target[k] = ss[k];
    }
}

function getSubSettings(set, keys) {
    var subset;
    if (!keys) {
        // if null/undefined/""
        subset = set;
    } else {
        if ( !(keys instanceof Array) ) {
            keys = [ keys ];
        }
        subset = {};
        keys.forEach(function(k) {
            subset[k] = set[k];
        });
    }
    return subset;
}

function _save(storage, data, cb) {
    if (storage === chrome.storage.sync) {
        // don't store snippets from localPath into sync storage, since sync storage has its quota.
        if (data.localPath) {
            delete data.snippets;
            delete data.localPath;
        }
        if (Object.keys(data).length > 1) {
            storage.set(data, cb);
        }
    } else {
        if (data.localPath) {
            delete data.snippets;
            const cacheSnippets = function(resp) {
                data.snippets = resp;
                storage.set(data, cb);
            };
            // `data` carries no `snippets` key, so the copy already in storage stays:
            // the settings being saved are unrelated to the file.
            const saveWithoutSnippets = function() {
                storage.set(data, cb);
            };
            // try to fetch snippets from localPath and cache it in local storage.
            if (data.localPath === NATIVE_LOCAL_PATH) {
                readNativeSettings(cacheSnippets, saveWithoutSnippets);
            } else {
                request(data.localPath, cacheSnippets, undefined, undefined, saveWithoutSnippets);
            }
        } else {
            storage.set(data, cb);
        }
    }
}

export { _save, dictFromArray, extendObject, getSubSettings, request };
