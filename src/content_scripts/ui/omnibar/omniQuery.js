import { createElementWithContent } from '../../common/utils.js';


export default function OmniQuery(omnibar, front) {
    var self = {
        prompt: 'ǭ'
    };

    function onlyUnique(value, index, self) {
        return self.indexOf(value) === index;
    }
    var _words;
    self.onOpen = function(arg) {
        if (arg && document.dictEnabled === undefined) {
            omnibar.input.value = arg;
            front.contentCommand({
                action: 'omnibar_query_entered',
                query: arg
            });
        }
        front.contentCommand({
            action: 'getPageText'
        }, function(message) {
            var splitRegex = /[^a-zA-Z]+/;
            _words = message.data.toLowerCase().split(splitRegex).filter(onlyUnique);
        });
    };

    self.onInput = function() {
        var iw = omnibar.input.value;
        var candidates = _words.filter(function(w) {
            return w.indexOf(iw) !== -1;
        });
        if (candidates.length) {
            omnibar.listResults(candidates, function(w) {
                return createElementWithContent('li', w);
            });
        }
    };

    self.onTabKey = function() {
        omnibar.input.value = omnibar.resultsDiv.querySelector('li.focused').innerText;
    };

    self.onEnter = function() {
        front.contentCommand({
            action: 'omnibar_query_entered',
            query: omnibar.input.value
        });
    };

    return self;
}
