import { createAnkiExportModal } from "./anki_export.js";

let modalInstance = null;

export const initAnkiExport = async ({ getConfig, saveConfig }) => {
  if (modalInstance) return modalInstance;

  try {
    const res = await fetch("./popup-export/popup.html");
    const html = await res.text();
    document.body.insertAdjacentHTML("beforeend", html);
  } catch (error) {
    console.error("Failed to load popup HTML", error);
  }

  const ankiExportModal = document.getElementById("anki-export-modal");
  const ankiExportPanel = document.getElementById("anki-export-panel");
  const ankiExportTitle = document.getElementById("anki-export-title");
  const ankiTabGroup = document.getElementById("anki-tab-group");
  const ankiTabConfig = document.getElementById("anki-tab-config");
  const ankiTabReview = document.getElementById("anki-tab-review");
  const ankiContentFrame = document.getElementById("anki-content-frame");
  const ankiConfigPanel = document.getElementById("anki-config-panel");
  const ankiReviewPanel = document.getElementById("anki-review-panel");
  const ankiTemplateSelect = document.getElementById("anki-template-select");
  const ankiTemplateDelete = document.getElementById("anki-template-delete");
  const ankiCustomSummary = document.getElementById("anki-custom-summary");
  const ankiCustomPanel = document.getElementById("anki-custom-panel");
  const ankiCustomName = document.getElementById("anki-custom-name");
  const ankiCustomTextMap = document.getElementById("anki-custom-text-map");
  const ankiCustomNoteMap = document.getElementById("anki-custom-note-map");
  const ankiCustomFields = document.getElementById("anki-custom-fields");
  const ankiCustomAddField = document.getElementById("anki-custom-add-field");
  const ankiCustomError = document.getElementById("anki-custom-error");
  const ankiVocabControls = document.getElementById("anki-vocab-controls");
  const ankiVocabMode = document.getElementById("anki-vocab-mode");
  const ankiVocabNav = document.getElementById("anki-vocab-nav");
  const ankiVocabPrev = document.getElementById("anki-vocab-prev");
  const ankiVocabNext = document.getElementById("anki-vocab-next");
  const ankiVocabCounter = document.getElementById("anki-vocab-counter");
  const ankiFrontToggle = document.getElementById("anki-front-toggle");
  const ankiTable = document.getElementById("anki-table");
  const ankiTableHeader = document.getElementById("anki-table-header");
  const ankiTableBody = document.getElementById("anki-table-body");
  const ankiVocabForm = document.getElementById("anki-vocab-form");
  const ankiReviewCard = document.getElementById("anki-review-card");
  const ankiReviewFrontText = document.getElementById("anki-review-front-text");
  const ankiReviewBackText = document.getElementById("anki-review-back-text");
  const ankiReviewBackSecondary = document.getElementById("anki-review-back-secondary");
  const ankiReviewWrap = document.getElementById("anki-review-wrap");
  const ankiReviewDots = document.getElementById("anki-review-dots");
  const ankiReviewHint = document.getElementById("anki-review-hint");
  const ankiReviewPrev = document.getElementById("anki-review-prev");
  const ankiReviewNext = document.getElementById("anki-review-next");
  const ankiReviewCounter = document.getElementById("anki-review-counter");
  const ankiTemplateEdit = document.getElementById("anki-template-edit");
  const ankiFooter = document.getElementById("anki-footer");
  const ankiPrimaryBtn = document.getElementById("anki-primary-btn");
  const ankiPrimaryText = document.getElementById("anki-primary-text");
  const ankiPrimaryIcon = document.getElementById("anki-primary-icon");
  const ankiCancelButton = document.getElementById("anki-cancel");
  const ankiCustomDelete = document.getElementById("anki-custom-delete");

  modalInstance = createAnkiExportModal({
    modal: ankiExportModal,
    panel: ankiExportPanel,
    exportTitle: ankiExportTitle,
    tabGroup: ankiTabGroup,
    tabConfigButton: ankiTabConfig,
    tabReviewButton: ankiTabReview,
    contentFrame: ankiContentFrame,
    configPanel: ankiConfigPanel,
    reviewPanel: ankiReviewPanel,
    templateSelect: ankiTemplateSelect,
    templateDeleteButton: ankiTemplateDelete,
    templateEditButton: ankiTemplateEdit,
    customSummary: ankiCustomSummary,
    customPanel: ankiCustomPanel,
    customNameInput: ankiCustomName,
    customTextMap: ankiCustomTextMap,
    customNoteMap: ankiCustomNoteMap,
    customFields: ankiCustomFields,
    customAddField: ankiCustomAddField,
    customDeleteButton: ankiCustomDelete,
    customError: ankiCustomError,
    vocabControls: ankiVocabControls,
    vocabMode: ankiVocabMode,
    vocabNav: ankiVocabNav,
    vocabPrev: ankiVocabPrev,
    vocabNext: ankiVocabNext,
    vocabCounter: ankiVocabCounter,
    frontToggle: ankiFrontToggle,
    table: ankiTable,
    tableHeader: ankiTableHeader,
    tableBody: ankiTableBody,
    vocabForm: ankiVocabForm,
    reviewCard: ankiReviewCard,
    reviewFront: ankiReviewFrontText,
    reviewBack: ankiReviewBackText,
    reviewBackSecondary: ankiReviewBackSecondary,
    reviewWrap: ankiReviewWrap,
    reviewDots: ankiReviewDots,
    reviewHint: ankiReviewHint,
    reviewPrev: ankiReviewPrev,
    reviewNext: ankiReviewNext,
    reviewCounter: ankiReviewCounter,
    primaryButton: ankiPrimaryBtn,
    primaryText: ankiPrimaryText,
    primaryIcon: ankiPrimaryIcon,
    cancelButton: ankiCancelButton,
    footer: ankiFooter,
    getCustomTemplates: () => getConfig().ankiTemplates || [],
    saveCustomTemplates: async (templates) => {
      const nextConfig = {
        ...getConfig(),
        ankiTemplates: templates
      };
      await saveConfig(nextConfig);
    },
    doc: document
  });

  return modalInstance;
};
