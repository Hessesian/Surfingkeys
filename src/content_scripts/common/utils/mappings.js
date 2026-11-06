import KeyboardUtils from '../keyboardUtils';
import { dispatchSKEvent } from '../runtime.js';
import { isInUIFrame } from './misc.js';

/**
 * Map the key sequence `lhs` to `rhs` for mode `ctx` in ACE editor.
 *
 * @param {string} lhs a key sequence to replace
 * @param {string} rhs a key sequence to be replaced
 * @param {string} ctx a mode such as `insert`, `normal`.
 *
 * @example aceVimMap('J', ':bn', 'normal');
 */
function aceVimMap(lhs, rhs, ctx) {
    dispatchSKEvent("front", ['addVimMap', lhs, rhs, ctx]);
}

/**
 * Add map key in ACE editor.
 *
 * @param {object} objects multiple objects to define key map in ACE, see more from [ace/keyboard/vim.js](https://github.com/ajaxorg/ace/blob/ec450c03b51aba3724cf90bb133708078d1f3de6/lib/ace/keyboard/vim.js#L927-L1099)
 *
 * @example
 * addVimMapKey(
 *     {
 *         keys: 'n',
 *         type: 'motion',
 *         motion: 'moveByCharacters',
 *         motionArgs: {
 *             forward: false
 *         }
 *     },
 *
 *     {
 *         keys: 'e',
 *         type: 'motion',
 *         motion: 'moveByLines',
 *         motionArgs: {
 *             forward: true,
 *             linewise: true
 *         }
 *     }
 * );
 */
function addVimMapKey() {
    dispatchSKEvent("front", ['addVimKeyMap', Array.from(arguments)]);
}

function parseAnnotation(ag) {
    let an = ag.annotation;
    if (an.constructor.name === "String") {
        // for parameterized annotations such as ["#6Search selected with {0}", "Google"]
        an = [an];
    }
    const annotations = an[0].match(/^#(\d+)(.*)/);
    if (annotations !== null) {
        ag.feature_group = parseInt(annotations[1]);
        an[0] = annotations[2];
    }
    // first element must not be ""
    ag.annotation = an[0].length === 0 ? "" : an;
    return ag;
}

function mapInMode(mode, nks, oks, new_annotation) {
    oks = KeyboardUtils.encodeKeystroke(oks);
    var old_map = mode.mappings.find(oks);
    if (old_map) {
        nks = KeyboardUtils.encodeKeystroke(nks);
        mode.mappings.remove(nks);
        // meta.word need to be new
        var meta = Object.assign({}, old_map.meta);
        if (new_annotation) {
            meta = Object.assign(meta, parseAnnotation({ annotation: new_annotation }));
        }
        mode.mappings.add(nks, meta);
        if (!isInUIFrame()) {
            dispatchSKEvent("front", ['addMapkey', mode.name, nks, oks]);
        }
    }
    return old_map;
}

function getAnnotations(mappings) {
    return mappings.getWords().map(function(w) {
        var meta = mappings.find(w).meta;
        return {
            word: w,
            feature_group: meta.feature_group,
            annotation: meta.annotation
        };
    }).filter(function(m) {
        return m.annotation && m.annotation.length > 0;
    });
}

export {
    aceVimMap,
    addVimMapKey,
    parseAnnotation,
    mapInMode,
    getAnnotations,
};
