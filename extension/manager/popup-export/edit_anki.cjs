const fs = require('fs');
const file = 'd:/store/note/extension/manager/popup-export/anki_export.js';
let content = fs.readFileSync(file, 'utf8');

// Remove vocab arguments
content = content.replace(/\bvocabControls,\s*/g, '');
content = content.replace(/\bvocabMode,\s*/g, '');
content = content.replace(/\bvocabNav,\s*/g, '');
content = content.replace(/\bvocabPrev,\s*/g, '');
content = content.replace(/\bvocabNext,\s*/g, '');
content = content.replace(/\bvocabCounter,\s*/g, '');
content = content.replace(/\bvocabForm,\s*/g, '');

// Remove vocab constants and fields
content = content.replace(/\s*const TEMPLATE_VOCAB = "vocab";/, '');
content = content.replace(/\s*const vocabFields = \[([\s\S]*?)\];/, '');

// Remove from renderTemplateOptions
content = content.replace(/\s*templateSelect\.appendChild\(buildOption\(TEMPLATE_VOCAB, "Vocabulary"\)\);/, '');

// Replace table toggles
content = content.replace(/table\.classList\.toggle\("is-vocab", value === TEMPLATE_VOCAB\);/g, '');

// Replace template assignment
content = content.replace(/template = value === TEMPLATE_VOCAB \? TEMPLATE_VOCAB : TEMPLATE_BASIC;/, 'template = TEMPLATE_BASIC;');

// Remove getVocabDefaultValue, getVocabKey, getVocabValue
content = content.replace(/\s*const getVocabDefaultValue = ([\s\S]*?)};/, '');
content = content.replace(/\s*const getVocabKey = \(itemId, field\) => `\$\{itemId\}:vocab:\$\{field\}`;/, '');
content = content.replace(/\s*const getVocabValue = ([\s\S]*?)};/, '');

// Remove audio things
content = content.replace(/\s*const resolveAudioSource = ([\s\S]*?)};/, '');
content = content.replace(/\s*const playAudio = ([\s\S]*?)};/, '');
content = content.replace(/\s*const renderAudioChips = ([\s\S]*?)\.join\(""\);\s*};/, '');
content = content.replace(/\s*reviewBack\?\.addEventListener\("click", \(event\) => \{\s*const chip = ([\s\S]*?)\}\);/, '');

// Header and table column width fix
content = content.replace(/const containerWidth = ([\s\S]*?)row\.style\.gridTemplateColumns = `repeat\(\$\{fields\.length \|\| 1\}, \$\{colWidth\}px\)`;/g, 'row.style.gridTemplateColumns = `repeat(${fields.length || 1}, minmax(160px, 1fr))`;');

// renderHeader vocab part
content = content.replace(/\} else \{\s*vocabFields\.forEach\(\(field\) => \{\s*const cell = doc\.createElement\("div"\);\s*cell\.className = "anki-cell";\s*const label = doc\.createElement\("div"\);\s*label\.textContent = field\.label;\s*cell\.appendChild\(label\);\s*if \(field\.hint\) \{\s*const hint = doc\.createElement\("span"\);\s*hint\.className = "anki-header-hint";\s*hint\.textContent = field\.hint;\s*cell\.appendChild\(hint\);\s*\}\s*row\.appendChild\(cell\);\s*\}\);\s*\}/, '}');

// renderTable vocab part
content = content.replace(/\s*if \(template === TEMPLATE_VOCAB\) \{\s*if \(vocabEditMode !== "table"\) return;([\s\S]*?)return;\s*\}/, '');

// vocabEditMode usages
content = content.replace(/\s*let vocabEditMode = "table";/, '');
content = content.replace(/\s*vocabEditMode = "table";/g, '');
content = content.replace(/\s*vocabEditMode = mode === "single" \? "single" : "table";/, '');

content = content.replace(/\s*if \(vocabEditMode !== "table"\) return;/, '');
content = content.replace(/\s*if \(template === TEMPLATE_CUSTOM && vocabEditMode === "single"\) \{/, 'if (template === TEMPLATE_CUSTOM) {');
content = content.replace(/\s*if \(template !== TEMPLATE_VOCAB \|\| vocabEditMode !== "single"\) return;([\s\S]*?)vocabForm\.appendChild\(row\);\s*\}\);\s*/, '');

content = content.replace(/vocabEditMode/g, '"table"'); // for leftover

// Remove vocab review parts in renderReview
content = content.replace(/\s*if \(template === TEMPLATE_VOCAB\) \{([\s\S]*?)\} else \{/g, 'if (false) {} else {');

// Clean up vocab form event listeners
content = content.replace(/\s*vocabPrev\?\.addEventListener\("click", ([\s\S]*?)\}\);/, '');
content = content.replace(/\s*vocabNext\?\.addEventListener\("click", ([\s\S]*?)\}\);/, '');
content = content.replace(/\s*vocabMode\?\.addEventListener\("click", ([\s\S]*?)\}\);/, '');

// updateSources vocab part
content = content.replace(/const isVocab = template === TEMPLATE_VOCAB;/g, 'const isVocab = false;');

fs.writeFileSync(file, content, 'utf8');
console.log('Done script');
