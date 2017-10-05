// ==UserScript==
// @name         ITJobs Filter
// @namespace    https://github.com/ricardoffp
// @version      1.0
// @description  Filters undesired companies of your choice from itjobs.pt jobs listing and search results.
// @author       Ricardo Prates
// @match        https://www.itjobs.pt/emprego*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/ricardoffp/itjobs-filter/master/itjobs-filter.js
// ==/UserScript==

console.log('ITJobs Filter running!');

(function (window, document) {
    'use strict';

    /**
     * Returns a usable parsed JSON object from the local storage.
     * Saves JSON objects to the local storage.
     */
    var LocalStorage = function () {

        var SCRIPT_KEY = 'ITJOBS_FILTER';

        this.get = function () {
            var storedBlockedCompanies =
                window.localStorage.getItem(SCRIPT_KEY);

            if (storedBlockedCompanies) {
                return JSON.parse(storedBlockedCompanies);
            }

            return {};
        };

        this.set = function (objJSON) {
            var srtJSON = JSON.stringify(objJSON);
            window.localStorage.setItem(SCRIPT_KEY, srtJSON);
        };
    };

    /**
     * Provides methods to easily retrieve, block, unblock and list blocked
     * companies.
     * @param {LocalStorage} localStorage The local storage manager in use.
     */
    var Store = function (localStorage) {

        var localStorageCache;

        var setState = function (companyName, isBlocked) {
            var currentlyBlockedCompanies = localStorage.get();

            if (isBlocked) {
                currentlyBlockedCompanies[companyName] = true;
            } else {
                delete currentlyBlockedCompanies[companyName];
            }

            localStorage.set(currentlyBlockedCompanies);
            localStorageCache = currentlyBlockedCompanies;
        };

        var init = function () {
            localStorageCache = localStorage.get();
        };

        this.block = function (companyName) {
            setState(companyName, true);
        };

        this.unblock = function (companyName) {
            setState(companyName, false);
        };

        this.isBlocked = function (companyName) {
            return localStorageCache[companyName];
        };

        this.list = function () {
            return Object.keys(localStorageCache);
        };

        init();
    };

    /**
     * Translation utility.
     * Automatically returns the right string for the language in use.
     */
    var Translate = (function () {
        var instance;

        var TRANSLATIONS = {
            closeButtonTitle: {
                en: 'Hide job offers from ',
                pt: 'Esconder ofertas de emprego de '
            },
            filterHeaderTitle: {
                en: 'Excluding',
                pt: 'Excluindo'
            },
            showOffers: {
                en: 'Unhide offers of ',
                pt: 'Mostrar ofertas de '
            }
        };

        var currentLanguage;

        var init = function () {
            currentLanguage = $('html').attr('lang');
        };

        init();

        return {
            get: function (key) {
                return TRANSLATIONS[key][currentLanguage];
            }
        };
    })();

    /**
     * Manages the exclusion list on the left side.
     * Adds and removes companies from the list.
     * Adding to the list is immediate and the main centre list is redrawn.
     * Removing requires a page reload because the removed items are lost.
     * However, the reload will only trigger 1 second after the last removal,
     * so that the user can remove several items at once.
     *
     * @param {Store} store The data storage in use.
     */
    var ExclusionList = function (store) {

        var FILTER_HEADER_MARKUP =
            '<h6 class="filter-h hidden">' +
                '<i class="fa fa-ban blue"></i>' +
                Translate.get('filterHeaderTitle') +
            '</h6>';
        var LIST_GROUP_MARKUP = '<ul class="list-group filter hidden"></ul>';

        var LIST_REMOVAL_TIMEOUT = 1000;

        var $filterHeader = $(FILTER_HEADER_MARKUP);
        var $listGroup = $(LIST_GROUP_MARKUP);
        var $sidebarContent;

        var addedCount = 0;
        var listItems = {};
        var self = this;
        var timeout = false;

        var remove = function (companyName) {
            addedCount--;

            if (!addedCount) {
                $filterHeader.addClass('hidden');
                $listGroup.addClass('hidden');
            }

            listItems[companyName].remove();
            delete listItems[companyName];

            store.unblock(companyName);
        };

        var init = function () {
            store
                .list()
                .sort(function (companyA, companyB) {
                    companyA = companyA.toLowerCase();
                    companyB = companyB.toLowerCase();

                    if (companyA < companyB) return -1;
                    if (companyA > companyB) return 1;
                    return 0;
                })
                .forEach(self.add);
        };

        var onUnHide = function (companyName) {
            // Allow the user to delete multiple entries before
            // refreshing the page.

            return function (e) {
                e.preventDefault();
                e.stopPropagation();
                remove(companyName);

                clearTimeout(timeout);

                timeout = setTimeout(function () {
                    window.location.reload();
                }, LIST_REMOVAL_TIMEOUT);
            };
        };

        this.add = function (companyName) {
            if (listItems[companyName]) {
                return;
            }

            if (!addedCount) {
                $filterHeader.removeClass('hidden');
                $listGroup.removeClass('hidden');
            }
            addedCount++;

            // ITJobs does not have these lists limited by CSS.
            var smallCompanyName =
                companyName.length > 18 ?
                companyName.slice(0, 17) + '…' : companyName;

            var title = Translate.get('showOffers') + companyName;
            var listItemMarkup =
                '<li class="list-group-item" remove="' + companyName + '">' +
                    '<a href="#" title="' + title + '">' +
                        '<div class="empty">&nbsp;</div>' +
                        smallCompanyName +
                        '<span class="badge">' +
                            '<i class="fa fa-plus-square-o"></i>' +
                        '</span>' +
                    '</a>' +
                '</li>';
            var $listItem = $(listItemMarkup);

            $listGroup.append($listItem);
            listItems[companyName] = $listItem;

            $listItem.find('a').first().click(onUnHide(companyName));
        };

        this.run = function () {
            $sidebarContent = $('#filters').find('.sidebar-content').first();
            $sidebarContent.append($filterHeader);
            $listGroup.insertAfter($filterHeader);
        };

        init();
    };

    /**
     * Filters hidden companies from the main list.
     * Add a button to hide companies when the mouse is hover the logo.
     * Automatically advance the page if there are no companies left.
     */
    var FilterUI = function () {

        var BUTTON_STYLES =
            '.itjf-block-btn {' +
                'position: absolute;' +
                'right: 0;' +
                'padding: 0;' +
                'border: none;' +
                'background: white;' +
                'font-size: 2rem;' +
                'opacity: 0;' +
                'width: 2.5rem;' +
                'height: 2.5rem;' +
                'display: inline-block;' +
                'border-radius: 0 0 0 .6rem;' +
                'transition: opacity .25s ease-in;' +
                'z-index: 10000;' +
            '}';

        var IMG_HOVER_STYLES =
            '.responsive-container:hover .itjf-block-btn {' +
                'opacity: 1;' +
                'transition: opacity .25s ease-in;' +
            '}';

        var IMG_TOUCH_STYLES =
            '.responsive-container .itjf-block-btn {' +
                'opacity: 1;' +
            '}';

        var store = new Store(new LocalStorage());
        var exclusionList = new ExclusionList(store);

        var $blocks;
        var nextPageLink;

        var hasTouch = function () {
            // Source:
            // https://github.com/Modernizr/Modernizr/blob/master/feature-detects/touchevents.js
            return ('ontouchstart' in window) ||
                window.DocumentTouch && document instanceof DocumentTouch;
        };

        var appendStyles = function () {
            // Always disable hover if the device has touch capabilities.
            var hoverStyles = hasTouch() ? IMG_TOUCH_STYLES : IMG_HOVER_STYLES;

            var $styles =
                $('<style>' + BUTTON_STYLES + hoverStyles + '</style>');
            $('head').append($styles);
        };

        var doRemoval = function () {
            var blockCount = $blocks.length;

            $blocks.each(function () {
                var $block = $(this);

                // Promoted blocks must be treated differently because they
                // have no lists inside.
                if ($block.hasClass('promoted')) {
                    var companyName = $block
                        .find('.list-name a')
                        .first()
                        .attr('title');

                    if (store.isBlocked(companyName)) {
                        --blockCount;
                        $block.remove();
                    }

                    return true;
                }

                // For normal blocks, we first remove the items and then,
                // if left empty, remove the block.
                var $items = $block.find('li');
                var itemsCount = $items.length;

                $items.each(function () {
                    var $item = $(this);
                    var companyName = $item
                        .find('div.list-name a')
                        .first()
                        .attr('title');

                    if (store.isBlocked(companyName)) {
                        $item.remove();
                        --itemsCount;
                    }
                });

                // If no items, remove the block.
                // Else, add the 'first' class to the first one.
                // Keep things consistent.
                if (!itemsCount) {
                    --blockCount;
                    $block.remove();
                } else {
                    $block.find('li').first().addClass('first');
                }
            });

            // Final check, go to next page if there are no more blocks.
            if (!blockCount && nextPageLink) {
                window.location.href = window.location.pathname + nextPageLink;
            }
        };

        var getButtonMarkup = function (companyName) {
            var title = Translate.get('closeButtonTitle') + companyName;
            return '<button class="itjf-block-btn" ' +
                        'name="' + companyName + '" ' +
                        'title="' + title + '">' +
                            '<i class="fa fa-minus-square-o blue"></i>' +
                    '</button>';
        };

        var onBlockButtonClick = function (e) {
            e.stopPropagation();
            var $clicked = $(this);
            var companyToBlock = $clicked.attr('name');
            store.block(companyToBlock);
            exclusionList.add(companyToBlock);
            doRemoval();
        };

        var placeBlockButtons = function () {
            $blocks.each(function () {
                var $block = $(this);

                // The company block buttons are placed differently in
                // normal or featured content.
                var $items;
                if ($block.hasClass('promoted')) {
                    $items = $block.find('.promoted-content .img-container a');
                } else {
                    $items = $block.find('li .img-container a');
                }

                $items.each(function () {
                    var $item = $(this);
                    var companyName = $item.attr('title');
                    var $button = $(getButtonMarkup(companyName))
                        .click(onBlockButtonClick);

                    $button.insertBefore($item.parent());
                });
            });
        };

        this.run = function () {
            $blocks = $('div.block.borderless');
            nextPageLink = $('.pagination-container .last a').attr('href');

            appendStyles();
            doRemoval();
            placeBlockButtons();
            exclusionList.run();
        };
    };

    var filterUI = new FilterUI();

    $(document).ready(function () {
        filterUI.run();
    });
})(window, document);
