(function () {
  function createDetailPanel({ state, el, GraphUtils, getNode, getEdge, saveLocal, render, escapeHtml }) {
    function bindBackdropClose(dialog) {
      dialog.addEventListener("click", (event) => {
        const rect = dialog.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside) dialog.close();
      });
    }

    function summaryCard(label, value) {
      return `<div class="summary-card"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`;
    }

    function buildNodeSummary(node) {
      const connected = state.graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).length;
      return [summaryCard("Type", node.type || "-"), summaryCard("Connections", String(connected)), summaryCard("Properties", String(Object.keys(node.properties || {}).length)), summaryCard("Position", `${node.x}, ${node.y}`)].join("");
    }

    function buildEdgeSummary(edge) {
      return [summaryCard("From", getNode(edge.from)?.title || edge.from), summaryCard("To", getNode(edge.to)?.title || edge.to), summaryCard("Label", edge.label || "-"), summaryCard("Edge ID", edge.id)].join("");
    }

    function getDetailDraft() {
      return state.detailDraft;
    }

    function renderPropertyTable(node) {
      const entries = Object.entries(node.properties || {});
      el.propertyTable.innerHTML = "";
      if (!entries.length) {
        el.propertyTable.innerHTML = '<div class="summary-card"><span>속성이 없다. 아래에서 추가할 수 있다.</span></div>';
        return;
      }
      entries.forEach(([key, value]) => {
        const row = document.createElement("div");
        row.className = "property-row";
        const keyInput = document.createElement("input");
        keyInput.value = key;
        const valueInput = document.createElement("input");
        valueInput.value = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "icon-btn";
        removeBtn.textContent = "×";
        keyInput.addEventListener("change", () => updatePropertyKey(key, keyInput.value));
        valueInput.addEventListener("input", () => updatePropertyValue(keyInput.value, valueInput.value, key));
        removeBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeProperty(keyInput.value || key);
        });
        row.appendChild(keyInput);
        row.appendChild(valueInput);
        row.appendChild(removeBtn);
        el.propertyTable.appendChild(row);
      });
    }

    function renderDetailSummary() {
      const draft = getDetailDraft();
      if (!draft || !state.selected) {
        el.detailSummary.innerHTML = "";
        return;
      }
      if (state.selected.kind === "node") {
        el.detailTitle.textContent = draft.title || draft.id;
        el.detailMeta.textContent = `${draft.type} · ${draft.id}`;
        el.detailSummary.innerHTML = buildNodeSummary(draft);
        return;
      }
      el.detailTitle.textContent = draft.label || draft.id;
      el.detailMeta.textContent = `Edge · ${draft.id}`;
      el.detailSummary.innerHTML = buildEdgeSummary(draft);
    }

    function populateDetailFields() {
      const draft = getDetailDraft();
      if (!draft || !state.selected) return;
      if (state.selected.kind === "node") {
        el.detailTitle.textContent = draft.title || draft.id;
        el.detailMeta.textContent = `${draft.type} · ${draft.id}`;
        el.fieldTitle.value = draft.title || "";
        el.fieldType.value = draft.type || "Default";
        el.fieldNotes.value = draft.notes || "";
        el.nodeFields.hidden = false;
        el.edgeFields.hidden = true;
        renderPropertyTable(draft);
      } else {
        el.detailTitle.textContent = draft.label || draft.id;
        el.detailMeta.textContent = `Edge · ${draft.id}`;
        el.fieldNotes.value = draft.notes || "";
        el.fieldEdgeLabel.value = draft.label || "";
        el.nodeFields.hidden = true;
        el.edgeFields.hidden = false;
      }
      renderDetailSummary();
    }

    function openDetailModal(selection) {
      if (state.mode === "connect" && selection.kind === "node") return;
      state.selected = selection;
      state.detailIsNew = false;
      state.detailOriginal = structuredClone(selection.kind === "node" ? getNode(selection.id) : getEdge(selection.id));
      state.detailDraft = structuredClone(state.detailOriginal);
      render();
      populateDetailFields();
      el.detailModal.showModal();
    }

    function addPropertyRow() {
      const node = getDetailDraft();
      if (!node) return;
      let key = "new_property";
      let index = 1;
      while (Object.prototype.hasOwnProperty.call(node.properties || {}, key)) key = `new_property_${index++}`;
      node.properties = node.properties || {};
      node.properties[key] = "";
      renderPropertyTable(node);
      renderDetailSummary();
    }

    function updatePropertyKey(oldKey, newKey) {
      const node = getDetailDraft();
      if (!node) return;
      const trimmed = newKey.trim();
      if (!trimmed || trimmed === oldKey) {
        renderPropertyTable(node);
        return;
      }
      const next = {};
      Object.entries(node.properties || {}).forEach(([key, value]) => {
        next[key === oldKey ? trimmed : key] = value;
      });
      node.properties = next;
      renderPropertyTable(node);
      renderDetailSummary();
    }

    function updatePropertyValue(key, value, fallbackKey) {
      const node = getDetailDraft();
      if (!node) return;
      const targetKey = key.trim() || fallbackKey;
      const parsedValue = GraphUtils.parsePropertyInput(value);
      node.properties = node.properties || {};
      if (targetKey !== fallbackKey && Object.prototype.hasOwnProperty.call(node.properties, fallbackKey)) {
        const oldValue = node.properties[fallbackKey];
        delete node.properties[fallbackKey];
        node.properties[targetKey] = value ? parsedValue : oldValue;
      } else {
        node.properties[targetKey] = parsedValue;
      }
      renderDetailSummary();
    }

    function removeProperty(key) {
      const node = getDetailDraft();
      if (!node || !node.properties) return;
      delete node.properties[key];
      renderPropertyTable(node);
      renderDetailSummary();
    }

    function saveDetailChanges() {
      const draft = getDetailDraft();
      if (!draft || !state.selected) return;
      if (state.selected.kind === "node") {
        if (state.detailIsNew) state.graph.nodes.push(structuredClone(draft));
        else Object.assign(getNode(state.selected.id), structuredClone(draft));
      } else {
        Object.assign(getEdge(state.selected.id), structuredClone(draft));
      }
      saveLocal();
      render();
      el.detailModal.close();
    }

    function cancelDetailChanges() {
      if (state.detailIsNew) state.selected = null;
      render();
      el.detailModal.close();
    }

    function resetDetailDraft() {
      state.detailDraft = null;
      state.detailOriginal = null;
      state.detailIsNew = false;
    }

    return {
      bindBackdropClose,
      openDetailModal,
      addPropertyRow,
      saveDetailChanges,
      cancelDetailChanges,
      resetDetailDraft,
      populateDetailFields,
      renderDetailSummary,
      getDetailDraft,
    };
  }

  window.RealworldDetailPanel = { createDetailPanel };
})();
