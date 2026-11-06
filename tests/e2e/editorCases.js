// The four editors on fixtures/editors.html: how to focus, reset and read each one.
module.exports = {
  ckeditor: { sel: '.ck-editor__editable', reset: 'ckReset()', text: 'ckText()' },
  lexical: { sel: '#lx', reset: 'lxReset()', text: 'lxText()' },
  plain: { sel: '#pl', reset: `(document.getElementById('pl').innerHTML='hello <b>bold</b> world')`, text: `document.getElementById('pl').innerText` },
  textarea: { sel: '#ta', reset: `(document.getElementById('ta').value='hello bold world')`, text: `document.getElementById('ta').value` },
};
