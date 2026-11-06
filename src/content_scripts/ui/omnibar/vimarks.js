import { RUNTIME } from '../../common/runtime.js';
import { separatorHtml } from './constants';

export default function OpenVIMarks(omnibar) {
    var self = {
        focusFirstCandidate: true,
        prompt: `VIMarks${separatorHtml}`
    };

    self.onOpen = function() {
        var query = omnibar.input.value;
        var urls = [];
        RUNTIME('getSettings', {
            key: 'marks'
        }, function(response) {
            for (var m in response.settings.marks) {
                var markInfo = response.settings.marks[m];
                if (typeof(markInfo) === "string") {
                    markInfo = {
                        url: markInfo,
                        scrollLeft: 0,
                        scrollTop: 0
                    };
                }
                if (query === "" || markInfo.url.indexOf(query) !== -1) {
                    urls.push({
                        title: m,
                        type: '🔗',
                        uid: 'M' + m,
                        url: markInfo.url
                    });
                }
            }
            omnibar.listURLs(urls, false);
        });
    };
    self.onInput = self.onOpen;
    return self;
}
