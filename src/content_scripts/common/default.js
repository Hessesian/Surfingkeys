import core from './mappings/core.js';
import translate from './mappings/translate.js';
import sentence from './mappings/sentence.js';
import tabsHints from './mappings/tabsHints.js';
import forms from './mappings/forms.js';
import search from './mappings/search.js';

export default function(api, clipboard, insert, normal, hints, visual, front, browser) {
    const deps = { api, clipboard, insert, normal, hints, visual, front, browser };
    core(deps);
    translate(deps);
    sentence(deps);
    tabsHints(deps);
    forms(deps);
    search(deps);
}
