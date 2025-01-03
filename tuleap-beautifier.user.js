// ==UserScript==
// @name         Tuleap Beautifier
// @namespace    http://tampermonkey.net/
// @version      2024-12-19
// @description  Optimisation
// @author       Relik77
// @match        https://tuleap.lundimatin.biz/plugins/tracker/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=lundimatin.biz
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @require      https://cdn.jsdelivr.net/npm/bootstrap@4.0.0/dist/js/bootstrap.min.js
// @require      https://cdn.jsdelivr.net/npm/bootstrap@4.0.0/dist/js/bootstrap.min.js
// @require      https://cdn.jsdelivr.net/npm/underscore@1.13.7/underscore-umd-min.js
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/marked-highlight/lib/index.umd.js
// @require      https://unpkg.com/@highlightjs/cdn-assets@11.11.1/highlight.min.js
// @require      https://unpkg.com/@highlightjs/cdn-assets@11.11.1/languages/java.min.js
// @require      https://unpkg.com/@highlightjs/cdn-assets@11.11.1/languages/kotlin.min.js
// ==/UserScript==

/* global $:false, _:false, marked:false, markedHighlight:false, hljs:false */

(function() {
    'use strict';

    function getCellValue(elt) {
        return elt.find(".cell-container").text();
    }

    class Group {
        constructor(name, values = []) {
            this.name = name;
            this.values = values;
        }

        static fromJSON(json) {
            return new Group(
                json.name,
                json.values
            );
        }

        toJSON() {
            return {
                name: this.name,
                values: this.values
            };
        }
    }

    class Data {
        constructor() {
            this.load();
        }

        load() {
            var json
            try {
                json = JSON.parse(GM_getValue("config"));
            } catch(e) {
                json = {};
            }
            this.groups = _.map(json.groups, item => Group.fromJSON(item));
        }

        addGroup(groupName, ...values) {
            var index = _.findIndex(this.groups, group => group.name == groupName);
            var group;
            if (index < 0) {
                group = new Group(groupName);
                if (values.length > 0) group.values.push(...values);
                this.groups.push(group);
                this.save();
            } else {
                group = this.groups[index];
                values = _.without(values, group.values);
                if (values.length > 0) group.values.push(...values);
                this.save();
            }
        }

        toJSON() {
            return {
                groups: this.groups.map(item => item.toJSON()),
            };
        }

        save() {
            GM_setValue("config", JSON.stringify(this.toJSON()));
        }
    }

    class TuleapCustomizer {
        constructor() {
            this.data = new Data();
            this.marked = new marked.Marked(
                markedHighlight.markedHighlight({
                    emptyLangClass: 'hljs',
                    langPrefix: 'hljs language-',
                    highlight(code, lang, info) {
                        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                        return hljs.highlight(code, { language }).value;
                    }
                }));
            console.log(this.data);
        }

        run() {
            this.addCSS();
            this.addTrackerFilters();
            this.markdownit();
        }

        markdownit() {
            $(".tracker_artifact_followup_comment_body").each((i, elt) => {
                const text = $(elt).text();
                $(elt).html(this.marked.parse(text));
            });
        }

        addTrackerFilters() {
            if ($("#tracker_report_query").length == 0) return;
            var table = $("#tracker_report_table");
            var tableHeader = $(table.find("> thead > tr:first-child")[0]);
            var tableRows = table.find("> tbody > tr:not(.tracker_report_table_aggregates)");

            var showGroup = (colId, args) => {
                var group = _.find(this.data.groups, group => group.name.toLowerCase() == args.toLowerCase());
                if (group) {
                    tableRows.each((index, row) => {
                        var cell = $($(row).find("td")[colId]);
                        var value = getCellValue(cell);
                        if (_.contains(group.values, value)) {
                            $(row).removeClass("hide");
                        }
                        refreshTableHeader();
                    });
                }
            }

            var hideGroup = (colId, args) => {
                var group = _.find(this.data.groups, group => group.name.toLowerCase() == args.toLowerCase());
                if (group) {
                    tableRows.each((index, row) => {
                        var cell = $($(row).find("td")[colId]);
                        var value = getCellValue(cell);
                        if (_.contains(group.values, value)) {
                            $(row).addClass("hide");
                        }
                        refreshTableHeader();
                    });
                }
            }

            var showAll = (colId, args) => {
                tableRows.each((index, row) => {
                    $(row).removeClass("hide");
                    refreshTableHeader();
                });
            }

            var commands = {
                showAll: showAll,
                showall: showAll,
                show: showGroup,
                showGroup: showGroup,
                showgroup: showGroup,
                "+": showGroup,
                hideGroup: hideGroup,
                hidegroup: hideGroup,
                "-": hideGroup,
                hide: hideGroup
            };

            var runCmd = (colId, cmd) => {
                if (cmd.length == 0) return;

                var cmdName = cmd;
                var args = "";

                if (commands[cmd[0]]) {
                    cmdName = cmd[0];
                    args = cmd.substring(1).trim();
                } else {
                    var index = cmd.indexOf(" ");
                    if (index > 0) {
                        cmdName = cmd.substring(0, index);
                        args = cmd.substring(index).trim();
                    }
                }
                if (commands[cmdName]) {
                    commands[cmdName](colId, args);
                }
            }

            var refreshTableHeader = () => {
                tableHeader.find("th").each((colId, elt) => {
                    if (colId < 3) return;
                    $(elt).find(".filter-bar").remove();
                    var cell = $(elt);
                    var toolBar = $(`<div class="filter-bar" style="display: flex; align-items: center;"></div>`);
                    var input = $(`<input type="text" style="margin: 0; width: auto;" value="">`);
                    input.on("keydown", (e) => {
                        if (e.key == "Enter") {
                            e.preventDefault();
                            runCmd(colId, input.val().trim());
                            input.val("");
                        }
                    });

                    toolBar.append(input);

                    var menu = $(`<div class="btn-group button_dropdowns row_menu" style="float: right"><a class="btn btn-mini dropdown-toggle" style="padding: 4px 6px;" data-toggle="dropdown" href="#"><i class="icon-filter"></i></a></div>`)
                    var menuContent = $(`<ul class="dropdown-menu ${colId > 0 ? "pull-right" : ""}"></ul>`);
                    menu.append(menuContent);

                    this.data.groups.forEach((group) => {
                        var checked = this.currentGroup == group ? (group.hide ? `<i class="icon-eye-close"></i> ` : "✓ ") : "";
                        var menuItem = $(`<li><a href="javascript:void(0)">${checked}${group.name}</a></li>`);
                        menuItem.on("click", () => showOnlyGroup(cell, group));
                        menuContent.append(menuItem);
                    });

                    toolBar.append(menu);
                    cell.append(toolBar);
                });
            }
            refreshTableHeader();

            var hideSame = (elt) => {
                var colId = elt.index();
                var contentToCmp = getCellValue(elt);
                tableRows.each((index, row) => {
                    var cell = $($(row).find("td")[colId]);
                    var value = getCellValue(cell);
                    if (value == contentToCmp) {
                        $(row).addClass("hide");
                    }
                });
            }

            var showSame = (elt) => {
                var colId = elt.index();
                var contentToCmp = elt.find(".cell-container").text();
                tableRows.each((index, row) => {
                    var cell = $($(row).find("td")[colId]);
                    var value = getCellValue(cell);
                    if (value != contentToCmp) {
                        $(row).addClass("hide");
                    } else {
                        $(row).removeClass("hide");
                    }
                });
            }

            var showOnlyGroup = (elt, group) => {
                if (this.currentGroup == group) group.hide = !group.hide;
                else group.hide = false;
                this.currentGroup = group;
                var colId = elt.index();
                tableRows.each((index, row) => {
                    var cell = $($(row).find("td")[colId]);
                    var value = getCellValue(cell);
                    if (!_.contains(group.values, value)) {
                        if (group.hide) {
                            $(row).removeClass("hide");
                        } else {
                            $(row).addClass("hide");
                        }
                    } else {
                        if (group.hide) {
                            $(row).addClass("hide");
                        } else {
                            $(row).removeClass("hide");
                        }
                    }
                    refreshTableHeader();
                });
            }

            var addToGroupe = (elt, group) => {
                var modal = $("#createGroupModal");
                modal.find("#save").off("click");
                modal.find("#save").on("click", () => {
                    var groupName = modal.find("#group-name").val();
                    this.data.addGroup(groupName, getCellValue(elt))
                    // save to group
                });
                modal.find("#group-name").val("");
            }

            tableRows.each((rowId, row) => {
                $(row).find("td").each((colId, elt) => {
                    if (colId < 3) return;
                    var cell = $(elt);
                    cell.css("position", "relative");
                    var content = cell.html();
                    cell.empty();
                    var container = $(`<div class="cell-container"></div>`);
                    container.append(content);
                    cell.append(container);

                    var menu = $(`<div class="btn-group button_dropdowns row_menu" style="float: right"><a class="btn btn-mini dropdown-toggle" data-toggle="dropdown" href="#"><i class="icon-filter"></i></a></div>`)
                    var menuContent = $(`<ul class="dropdown-menu ${colId > 0 ? "pull-right" : ""}"></ul>`);
                    menu.append(menuContent);

                    var menuItem = $(`<li><a href="javascript:void(0)">Cacher les lignes similaire</a></li>`);
                    menuItem.on("click", () => hideSame(cell));
                    menuContent.append(menuItem);

                    menuItem = $(`<li><a href="javascript:void(0)">Voir les lignes similaire</a></li>`);
                    menuItem.on("click", () => showSame(cell));
                    menuContent.append(menuItem);

                    menuItem = $(`<li><a href="javascript:void(0)" data-toggle="modal" data-target="#createGroupModal">Ajouter à un nouveau groupe</a></li>`);
                    menuItem.on("click", () => addToGroupe(cell));
                    menuContent.append(menuItem);

                    cell.append(menu);

                    var groups = _.filter(this.data.groups, group => _.contains(group.values, getCellValue(cell)));
                    if (groups.length > 0) {
                        var groupsName = groups.map(g => g.name).join(", ");
                        cell.append(`<span style="position: absolute; left: 4px; bottom: 0; font-size: 12px; opacity: 0.6; font-weight: bold;">${groupsName}</span>`);
                    }
                });
            });

            $(`
<div class="modal fade" id="createGroupModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
  <div class="modal-dialog" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLabel">Ajouter à un nouveau groupe</h5>
      </div>
      <div class="modal-body">
        <form>
          <div class="form-group" style="display: flex; flex-direction: column;">
            <label for="recipient-name" class="col-form-label">Nom du groupe:</label>
            <input type="text" style="width: auto" class="form-control" id="group-name">
          </div>
         </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Annuler</button>
        <button id="save" type="button" class="btn btn-primary" data-dismiss="modal">Sauvegarder</button>
      </div>
    </div>
  </div>
</div>`).appendTo(".content");
        }

        addCSS() {
            $(`<link href="https://unpkg.com/@highlightjs/cdn-assets@11.11.1/styles/default.min.css" rel="stylesheet"/>`).appendTo("head");
            $(`<link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap" rel="stylesheet"/>`).appendTo("head");
            //$(`<link href="https://cdnjs.cloudflare.com/ajax/libs/mdb-ui-kit/8.1.0/mdb.min.css" rel="stylesheet"/>`).appendTo("head");
            $(`<style rel="stylesheet" type="text/css">
    .tracker_artifact,
    #tracker_artifact_followup_comments #tracker_artifact_followup_comments-content {
        max-width: 100%;
    }
    .tracker_artifact_fieldset_content tr td {
        width: 50%;
    }
    .tracker_artifact_field.editable input[type='text'] {
        width: 100%;
    }
</style>`).appendTo("head");
            $(`<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet"/>`).appendTo("head");
        }
    }

    $(document).ready(() => {
        new TuleapCustomizer().run();
    });
})();