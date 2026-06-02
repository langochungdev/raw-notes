const fs = require('fs');
const file = 'd:/store/note/extension/manager/popup-export/anki_export.js';
let content = fs.readFileSync(file, 'utf8');

// Replace renderVocabForm entirely
content = content.replace(/const renderVocabForm = \(\) => \{[\s\S]*?const renderReview = \(\) => \{/g, 'const renderVocabForm = () => {};\n\n  const renderReview = () => {');

// Remove references in renderReview
content = content.replace(/\s*if \(vocabCounter\) vocabCounter\.textContent = "0 \/ 0";/g, '');
content = content.replace(/\s*if \(template === TEMPLATE_VOCAB && vocabCounter\) \{[\s\S]*?\}/g, '');

// Remove updateSources parts
content = content.replace(/\s*if \(vocabControls\) \{[\s\S]*?\}/g, '');
content = content.replace(/\s*if \(vocabNav\) \{[\s\S]*?\}/g, '');
content = content.replace(/\s*if \(vocabMode\) \{[\s\S]*?\}/g, '');
content = content.replace(/\s*if \(vocabForm\) \{[\s\S]*?\}/g, '');

content = content.replace(/\s*panel\.classList\.toggle\("is-vocab-table"[\s\S]*?\);/g, '');
content = content.replace(/\s*panel\.classList\.toggle\("is-vocab-single"[\s\S]*?\);/g, '');
content = content.replace(/\s*table\.classList\.toggle\("hidden", \(isVocab \|\| isCustom\) && "table" !== "table"\);/g, '');
content = content.replace(/\s*reviewCard\.classList\.toggle\("is-vocab", isVocab\);/g, '');

// Remove TEMPLATE_VOCAB in open() and listener
content = content.replace(/\s*if \(panel\) \{\s*panel\.classList\.toggle\("is-vocab", template === TEMPLATE_VOCAB\);\s*\}/g, '');
content = content.replace(/\s*if \(table\) \{\s*table\.classList\.toggle\("is-vocab", template === TEMPLATE_VOCAB\);\s*\}/g, '');

// Remove any remaining isVocab declarations or conditions
content = content.replace(/isVocab \|\| isCustom/g, 'isCustom');
content = content.replace(/const isVocab = false;/g, '');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed script');
