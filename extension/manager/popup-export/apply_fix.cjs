const fs = require('fs');
const file = 'd:/store/note/extension/manager/popup-export/anki_export.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove vocab arguments from createAnkiExportModal
content = content.replace(/\s*vocabControls,/, '');
content = content.replace(/\s*vocabMode,/, '');
content = content.replace(/\s*vocabNav,/, '');
content = content.replace(/\s*vocabPrev,/, '');
content = content.replace(/\s*vocabNext,/, '');
content = content.replace(/\s*vocabCounter,/, '');
content = content.replace(/\s*vocabForm,/, '');

// 2. Remove vocab edit mode variable
content = content.replace(/\s*let vocabEditMode = "table";/, '');

// 3. Remove vocab constants
content = content.replace(/\s*const TEMPLATE_VOCAB = "vocab";/, '');
content = content.replace(/\s*const vocabFields = \[[\s\S]*?\];/, '');

// 4. Remove vocab option in renderTemplateOptions
content = content.replace(/\s*templateSelect\.appendChild\(buildOption\(TEMPLATE_VOCAB, "Vocabulary"\)\);/, '');

// 5. Update table class toggles
content = content.replace(/\s*table\.classList\.toggle\("is-vocab", value === TEMPLATE_VOCAB\);/g, '');
content = content.replace(/\s*panel\.classList\.toggle\("is-vocab", template === TEMPLATE_VOCAB\);/g, '');

// 6. Update template assignment
content = content.replace(/template = value === TEMPLATE_VOCAB \? TEMPLATE_VOCAB : TEMPLATE_BASIC;/, 'template = TEMPLATE_BASIC;');

// 7. Remove vocab functions
content = content.replace(/\s*const getVocabDefaultValue = \([\s\S]*?\}\s*};/, '');
content = content.replace(/\s*const getVocabKey = \([\s\S]*?\};/, '');
content = content.replace(/\s*const getVocabValue = \([\s\S]*?\}\s*};/, '');
content = content.replace(/\s*const resolveAudioSource = \([\s\S]*?\}\s*};/, '');
content = content.replace(/\s*const playAudio = \([\s\S]*?\}\s*};/, '');
content = content.replace(/\s*const renderAudioChips = \([\s\S]*?\}\s*};\s*\}\);\s*\};\s*/, '');

// 8. Fix renderHeader (remove else block with vocabFields)
content = content.replace(/\} else \{\s*vocabFields\.forEach\(\(field\) => \{[\s\S]*?\}\);\s*\}/, '}');

// 9. Fix renderTable (remove vocab table logic and fix custom layout)
content = content.replace(/\s*if \(vocabEditMode !== "table"\) return;/, '');
content = content.replace(/const containerWidth = tableBody\?\.clientWidth \|\| table\?\.clientWidth \|\| 800;\s*const colWidth = Math\.max\(160, Math\.floor\(containerWidth \/ Math\.max\(1, fields\.length\)\)\);\s*items\.forEach\(\(item\) => \{\s*const row = doc\.createElement\("div"\);\s*row\.className = "anki-row";\s*row\.style\.gridTemplateColumns = `repeat\(\$\{fields\.length \|\| 1\}, \$\{colWidth\}px\)`/,
'items.forEach((item) => {\n        const row = doc.createElement("div");\n        row.className = "anki-row";\n        row.style.gridTemplateColumns = `repeat(${fields.length || 1}, minmax(160px, 1fr))`'
);
content = content.replace(/\s*if \(template === TEMPLATE_VOCAB\) \{[\s\S]*?return;\s*\}/, '');

// 10. Replace renderVocabForm completely
content = content.replace(/\s*const renderVocabForm = \(\) => \{[\s\S]*?const renderReview = \(\) => \{/, '\n\n  const renderVocabForm = () => {};\n\n  const renderReview = () => {');

// 11. Fix renderReview
content = content.replace(/\s*if \(template === TEMPLATE_VOCAB\) \{[\s\S]*?\} else \{/g, '\n    if (false) {} else {');
content = content.replace(/\s*if \(template === TEMPLATE_VOCAB && vocabCounter\) \{\s*vocabCounter\.textContent = `\$\{currentIndex \+ 1\} \/ \$\{total\}`;\s*\}/g, '');
content = content.replace(/\s*if \(vocabCounter\) vocabCounter\.textContent = "0 \/ 0";/g, '');

// 12. Fix updateSources
content = content.replace(/const isVocab = template === TEMPLATE_VOCAB;/g, 'const isVocab = false;');
content = content.replace(/\s*if \(vocabControls\) \{[\s\S]*?\}/g, '');
content = content.replace(/\s*if \(vocabNav\) \{[\s\S]*?\}/g, '');
content = content.replace(/\s*if \(vocabMode\) \{[\s\S]*?\}/g, '');
content = content.replace(/\s*if \(vocabForm\) \{[\s\S]*?\}/g, '');
content = content.replace(/\s*panel\.classList\.toggle\("is-vocab-table"[\s\S]*?\);/g, '');
content = content.replace(/\s*panel\.classList\.toggle\("is-vocab-single"[\s\S]*?\);/g, '');
content = content.replace(/\s*table\.classList\.toggle\("hidden", \(isVocab \|\| isCustom\) && vocabEditMode !== "table"\);/g, '');
content = content.replace(/\s*reviewCard\.classList\.toggle\("is-vocab", isVocab\);/g, '');
content = content.replace(/isVocab \|\| isCustom/g, 'isCustom');

// 13. Remove remaining event listeners
content = content.replace(/\s*vocabMode\?\.addEventListener\("click"[\s\S]*?\}\);/g, '');
content = content.replace(/\s*vocabPrev\?\.addEventListener\("click"[\s\S]*?\}\);/g, '');
content = content.replace(/\s*vocabNext\?\.addEventListener\("click"[\s\S]*?\}\);/g, '');
content = content.replace(/\s*reviewBack\?\.addEventListener\("click"[\s\S]*?\}\);/g, '');

// Fix updateSources missing definitions because I removed them, but they were commented out above in step 12
content = content.replace(/\s*table\.classList\.toggle\("hidden", isCustom && vocabEditMode !== "table"\);/g, '');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed successfully');
