import { htmlEncode, setSanitizedContent } from '../../common/utils.js';

export default function installBanner(self) {
    const _actions = self._actions;
    const _banner = document.getElementById('sk_banner');
    function showBanner(content, linger_time) {
        _banner.style.cssText = "";
        _banner.style.display = "";
        _banner.style.top = "0px";
        setSanitizedContent(_banner, htmlEncode(content));
        self.flush();

        let timems = linger_time || 1600;
        setTimeout(function() {
            _banner.style.cssText = "";
            _banner.style.display = "none";
            self.flush();
        }, timems);
    }
    _actions['showBanner'] = function(message) {
        showBanner(message.content, message.linger_time);
    };

    return showBanner;
}
