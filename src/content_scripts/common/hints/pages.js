import { runtime } from '../runtime.js';
import { steppedPageUrl } from '../../../core/hintLabels';
import { getClickableElements } from '../utils.js';

// Hints.click, previousPage and nextPage: follow a rel=prev/next link or, failing that,
// step the page number in the URL.
export default function installPageNav(self) {
    function walkPageUrl(step) {
        const url = steppedPageUrl(window.location.href, runtime.conf.pageUrlRegex, step);
        if (url === null) {
            return false;
        }
        window.location.href = url;
        return true;
    }

    function uniqueLinks(links) {
        let unique = {};
        links.forEach(function(link) {
            let href = link.getAttribute('href');
            if (!unique[href]) {
                unique[href] = link;
            }
        });
        return Object.values(unique);
    }

    /**
     * Click element or create hints for elements to click.
     *
     * @param links `string or array of HTMLElement`, click on it if there is only one in the array or `force` parameter is true, otherwise hints will be generated for them. If `links` is a string, it will be used as css selector for `getClickableElements`.
     * @param {boolean} [force=false] force to click the first input element whether there are more than one elements in `links` or not.
     * @name Hints.click
     *
     * @example
     * mapkey('zz', 'Hide replies', function() {
     *     Hints.click(document.querySelectorAll("#less-replies:not([hidden])"), true);
     * });
     */
    self.click = function(links, force) {
        if (typeof(links) === 'string') {
            links = getClickableElements(links);
        }
        if (links.length > 1) {
            if (force) {
                links.forEach(function(u) {
                    self.dispatchMouseClick(u);
                });
            } else {
                self.create(links, self.dispatchMouseClick);
            }
        } else if (links.length === 1) {
            self.dispatchMouseClick(links[0]);
        }
    };

    self.previousPage = function () {
        var prevLinks = uniqueLinks(getClickableElements("[rel=prev]", runtime.conf.prevLinkRegex));
        if (prevLinks.length) {
            self.click(prevLinks);
            return true;
        } else {
            return walkPageUrl(-1);
        }
    };

    self.nextPage = function () {
        var nextLinks = uniqueLinks(getClickableElements("[rel=next]", runtime.conf.nextLinkRegex));
        if (nextLinks.length) {
            self.click(nextLinks);
            return true;
        } else {
            return walkPageUrl(1);
        }
    };
}
