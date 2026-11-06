import { RUNTIME } from '../runtime.js';
import {
    showBanner,
    tabOpenLink,
} from '../utils.js';

export default function register({ api, clipboard, hints, front }) {
    const {
        mapkey,
    } = api;

    function getFormData(form, format) {
        var formData = new FormData(form);
        if (format === "json") {
            var obj = {};

            formData.forEach(function (value, key) {
                if (obj.hasOwnProperty(key)) {
                    if (value.length) {
                        var p = obj[key];
                        if (p.constructor.name === "Array") {
                            p.push(value);
                        } else {
                            obj[key] = [];
                            if (p.length) {
                                obj[key].push(p);
                            }
                            obj[key].push(value);
                        }
                    }
                } else {
                    obj[key] = value;
                }
            });

            return obj;
        } else {
            return new URLSearchParams(formData).toString();
        }
    }
    function generateFormKey(form) {
        return (form.method || "get") + "::" + new URL(form.action).pathname;
    }
    mapkey('yf', '#7Copy form data in JSON on current page', function() {
        var fd = {};
        document.querySelectorAll('form').forEach(function(form) {
            fd[generateFormKey(form)] = getFormData(form, "json");
        });
        clipboard.write(JSON.stringify(fd, null, 4));
    });
    mapkey(';pf', '#7Fill form with data from yf', function() {
        hints.create('form', function(element, event) {
            var formKey = generateFormKey(element);
            clipboard.read(function(response) {
                var forms = JSON.parse(response.data.trim());
                if (forms.hasOwnProperty(formKey)) {
                    var fd = forms[formKey];
                    element.querySelectorAll('input, textarea').forEach(function(ip) {
                        if (fd.hasOwnProperty(ip.name) && ip.type !== "hidden") {
                            if (ip.type === "radio") {
                                var op = element.querySelector(`input[name='${ip.name}'][value='${fd[ip.name]}']`);
                                if (op) {
                                    op.checked = true;
                                }
                            } else if (Array.isArray(fd[ip.name])) {
                                element.querySelectorAll(`input[name='${ip.name}']`).forEach(function(ip) {
                                    ip.checked = false;
                                });
                                var vals = fd[ip.name];
                                vals.forEach(function(v) {
                                    var op = element.querySelector(`input[name='${ip.name}'][value='${v}']`);
                                    if (op) {
                                        op.checked = true;
                                    }
                                });
                            } else if (typeof(fd[ip.name]) === "string") {
                                ip.value = fd[ip.name];
                            }
                        }
                    });
                } else {
                    showBanner("No form data found for your selection from clipboard.");
                }
            });
        });
    });
    mapkey('yp', '#7Copy form data for POST on current page', function() {
        var aa = [];
        document.querySelectorAll('form').forEach(function(form) {
            var fd = {};
            fd[(form.method || "get") + "::" + form.action] = getFormData(form);
            aa.push(fd);
        });
        clipboard.write(JSON.stringify(aa, null, 4));
    });

    mapkey('g?', '#4Reload current page without query string(all parts after question mark)', function() {
        window.location.href = window.location.href.replace(/\?[^\?]*$/, '');
    });
    mapkey('g#', '#4Reload current page without hash fragment', function() {
        window.location.href = window.location.href.replace(/\#[^\#]*$/, '');
    });
    mapkey('gU', '#4Go to root of current URL hierarchy', function() {
        window.location.href = window.location.href.replace(new RegExp('(://([^/]+/){'+RUNTIME.repeats+'}).*'), '$1');
        RUNTIME.repeats = 1;
    });
    mapkey('gxt', '#3Close tab on left', function() {
        RUNTIME("closeTabLeft");
    });
    mapkey('gxT', '#3Close tab on right', function() {
        RUNTIME("closeTabRight");
    });
    mapkey('gx0', '#3Close all tabs on left', function() {
        RUNTIME("closeTabsToLeft");
    });
    mapkey('gx$', '#3Close all tabs on right', function() {
        RUNTIME("closeTabsToRight");
    });
    mapkey('gxx', '#3Close all tabs except current one', function() {
        RUNTIME("tabOnly");
    });
    mapkey('gxp', '#3Close playing tab', function() {
        RUNTIME("closeAudibleTab");
    });
    mapkey(';e', '#11Edit Settings', function() {
        tabOpenLink("/pages/options.html");
    });
    mapkey(';u', '#4Edit current URL with vim editor, and open in new tab', function() {
        front.showEditor(window.location.href, function(data) {
            tabOpenLink(data);
        }, 'url');
    });
    mapkey(';U', '#4Edit current URL with vim editor, and reload', function() {
        front.showEditor(window.location.href, function(data) {
            window.location.href = data;
        }, 'url');
    });
}
