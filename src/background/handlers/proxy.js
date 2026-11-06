import { dictFromArray } from '../storage.js';

export default function registerProxy(bg) {
    const {self, browser, _response} = bg;
    const loadSettings = (...args) => bg.loadSettings(...args);
    const _updateAndPostSettings = (...args) => bg._updateAndPostSettings(...args);
    bg.updateProxy = updateProxy;


    function updateProxy(message, cb) {
        loadSettings(['proxyMode', 'proxy', 'autoproxy_hosts'], function(proxyConf) {
            if (message.operation === "deleteProxyPair") {
                proxyConf.proxy.splice(message.number, 1);
                proxyConf.autoproxy_hosts.splice(message.number, 1);
            } else if (message.operation === "set") {
                proxyConf.proxyMode = message.mode;
                proxyConf.proxy = message.proxy;
                proxyConf.autoproxy_hosts = message.host;
            } else {
                if (message.mode) {
                    proxyConf.proxyMode = message.mode;
                }
                if (!message.number) {
                    message.number = 0;
                }
                if (message.proxy) {
                    proxyConf.proxy[message.number] = message.proxy;
                    if (proxyConf.autoproxy_hosts.length <= message.number) {
                        proxyConf.autoproxy_hosts[message.number] = [];
                    }
                }
                if (message.host) {
                    var hostsDict = dictFromArray(proxyConf.autoproxy_hosts[message.number], 1);
                    var hosts = message.host.split(/\s*[ ,\n]\s*/);
                    if (message.operation === "toggle") {
                        hosts.forEach(function(host) {
                            if (hostsDict.hasOwnProperty(host)) {
                                delete hostsDict[host];
                            } else {
                                hostsDict[host] = 1;
                            }
                        });
                    } else if (message.operation === "add") {
                        hosts.forEach(function(host) {
                            hostsDict[host] = 1;
                        });
                    } else {
                        hosts.forEach(function(host) {
                            delete hostsDict[host];
                        });
                    }
                    proxyConf.autoproxy_hosts[message.number] = Object.keys(hostsDict);
                }
            }
            var diffSet = {
                autoproxy_hosts: proxyConf.autoproxy_hosts,
                proxyMode: proxyConf.proxyMode,
                proxy: proxyConf.proxy
            };
            _updateAndPostSettings(diffSet);
            browser._applyProxySettings(proxyConf);
            cb && cb(diffSet);
        });
    }
    self.updateProxy = function(message, sender, sendResponse) {
        updateProxy(message, function(diffSet) {
            _response(message, sendResponse, diffSet);
        });
    };

    var userAgent;
    function onBeforeSendHeaders(details) {
        for (var i = 0; i < details.requestHeaders.length; ++i) {
            if (details.requestHeaders[i].name === 'User-Agent') {
                details.requestHeaders[i].value = userAgent;
                break;
            }
        }
        return {requestHeaders: details.requestHeaders};
    }
}
