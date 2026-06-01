export const attachLogViewer = ({
  viewLogsButton,
  logModal,
  closeLogsButton,
  clearLogsButton,
  copyLogsButton,
  logFilterButtons,
  logList,
  logger,
  showNotice,
  doc
}) => {
  let logFilter = "all";
  let refreshId = null;

  const setLogFilter = (nextFilter) => {
    logFilter = nextFilter;
    logFilterButtons.forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.logFilter === logFilter
      );
    });
  };

  const renderLogs = (logs) => {
    logList.textContent = "";
    if (logs.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "log-empty";
      empty.textContent = "No logs";
      logList.appendChild(empty);
      return;
    }
    logs.forEach((entry) => {
      const row = doc.createElement("div");
      row.className = "log-item";
      const time = doc.createElement("div");
      time.textContent = entry.timestamp?.slice(11, 19) || "--:--:--";
      const level = doc.createElement("div");
      level.className = "log-level";
      level.textContent = entry.level;
      const levelLower = entry.level?.toLowerCase();
      if (levelLower) {
        level.classList.add(levelLower);
      }
      const module = doc.createElement("div");
      module.textContent = entry.module || "-";
      const message = doc.createElement("div");
      message.textContent = entry.message || "";
      row.appendChild(time);
      row.appendChild(level);
      row.appendChild(module);
      row.appendChild(message);
      logList.appendChild(row);
    });
  };

  const loadLogs = async () => {
    const logs = await logger.getLogs(
      logFilter === "all" ? {} : { level: logFilter }
    );
    renderLogs(logs);
  };

  const startRefresh = () => {
    if (refreshId) return;
    refreshId = setInterval(() => {
      loadLogs();
    }, 1500);
  };

  const stopRefresh = () => {
    if (!refreshId) return;
    clearInterval(refreshId);
    refreshId = null;
  };

  viewLogsButton.addEventListener("click", async () => {
    logModal.classList.remove("hidden");
    setLogFilter("all");
    await loadLogs();
    startRefresh();
  });

  closeLogsButton.addEventListener("click", () => {
    logModal.classList.add("hidden");
    stopRefresh();
  });

  logModal.addEventListener("pointerdown", (event) => {
    if (event.target === logModal) {
      logModal.classList.add("hidden");
      stopRefresh();
    }
  });

  logFilterButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      setLogFilter(button.dataset.logFilter || "all");
      await loadLogs();
    });
  });

  clearLogsButton.addEventListener("click", async () => {
    await logger.clearLogs();
    await loadLogs();
    showNotice(doc, "Logs cleared");
  });

  copyLogsButton.addEventListener("click", async () => {
    const logs = await logger.copyLogs();
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(logs);
      showNotice(doc, "Logs copied");
    } else {
      showNotice(doc, "Clipboard not supported");
    }
  });
};
