import { MythixUIComponent, Utils } from '@cdn/mythix-ui-core@1';

const IS_TEMPLATE = /^template$/i;

export class MythixUIForEach extends MythixUIComponent {
  static tagName = 'mythix-for-each';

  createShadowDOM() {
  }

  mounted() {
    super.mounted();

    let preMountItems = this.items;
    let _items        = new Utils.DynamicProperty([]);

    const updateAndRender = (value) => {
      if (value === this.items)
        return this.render(_items.valueOf());

      let items = value;
      if (Utils.isType(items, Utils.DynamicProperty))
        items = items.valueOf();

      let changeEvent = new Event('change');
      changeEvent.originator = this;
      changeEvent.oldValue = this.items;
      changeEvent.value = items;

      this.dispatchEvent(changeEvent);
      if (changeEvent.defaultPrevented)
        return;

      _items[Utils.DynamicProperty.set](items);
      this.render(_items.valueOf());
    };

    Object.defineProperties(this, {
      'items': {
        enumerable:   false,
        configurable: true,
        get:          () => {
          return _items;
        },
        set:          (value) => {
          updateAndRender(value);
        },
      },
      'itemTemplate': {
        writable:     true,
        enumerable:   false,
        configurable: false,
        value:        this.getChildrenAsFragment(true) || this.itemTemplate || this.getRawTemplate(),
      },
    });

    if (Utils.isNotNOE(preMountItems))
      updateAndRender(preMountItems);
  }

  setItemTemplate(element) {
    this.itemTemplate = element;

    // Force a re-render
    // eslint-disable-next-line no-self-assign
    this.items = this.items;
  }

  onOfChange({ value }) {
    this.items = value;
  }

  clearRenderedItems() {
    let childNodes = (this.ownerDocument || document).createDocumentFragment();
    while (this.childNodes.length)
      childNodes.appendChild(this.childNodes[0]);

    return childNodes;
  }

  updateExistingItem(context, item, existingItem) {
    let allAttributeNames = new Set(item.getAttributeNames().concat(existingItem.getAttributeNames()));
    for (let attributeName of allAttributeNames.values()) {
      if (!item.hasAttribute(attributeName) && existingItem.hasAttribute(attributeName)) {
        existingItem.removeAttribute(attributeName);
        continue;
      }

      let itemValue         = item.getAttribute(attributeName);
      let existingItemValue = existingItem.getAttribute(attributeName);

      if (itemValue !== existingItemValue)
        existingItem.setAttribute(itemValue);
    }

    return item;
  }

  metadataKey() {
    return `mythix-for-each:${this.getIdentifier()}`;
  }

  insertRenderedItem(context, _item) {
    let item = _item;

    Utils.metadata(item, this.metadataKey(), context);
    Utils.metadata(item, 'mythix-for-each', context);

    const dispatchRenderedItemEvent = (context, item) => {
      let event = new Event('item:rendered');

      event.relatedTarget = item;
      event.context = context;

      this.dispatchEvent(event);
    };

    if (item.nodeType === Node.TEXT_NODE) {
      dispatchRenderedItemEvent(context, item);

      this.appendChild(item);

      return;
    }

    if (this.getAttribute('cache') !== 'false') {
      let {
        renderedItems,
      } = context;

      let itemID = item.getAttribute('id');
      if (!itemID) {
        let idItem = context.item;
        itemID = `ID${(Utils.isCollectable(idItem)) ? Utils.getObjectID(item) : Utils.SHA256(idItem)}`;
        item.setAttribute('id', itemID);
      }

      let existingItem = renderedItems.querySelector(`${item.localName}#${itemID}`);
      if (existingItem) {
        // Update attributes on existing element
        this.updateExistingItem(context, item, existingItem);
        item = existingItem;

        // We still need to add it back to the DOM, because it
        // was removed when we started render
      }
    }

    item.setAttribute('part', 'item');

    dispatchRenderedItemEvent(context, item);

    this.appendChild(item);

    return item;
  }

  insertRenderedResult(context, _result) {
    const isItemEmpty = (item) => {
      if (item == null || item === false || item === true || Object.is(item, NaN))
        return true;

      return false;
    };

    if (isItemEmpty(_result))
      return;

    let result = _result;
    if (!Array.isArray(result))
      result = [ result ];

    const createAndRegisterTextNode = (item) => {
      let textNode = context.ownerDocument.createTextNode(item.toString());

      Utils.metadata(textNode, this.metadataKey(), context);
      Utils.metadata(textNode, 'mythix-for-each', context);

      item.registerForUpdate(textNode, (textNode, item) => {
        textNode.nodeValue = item.toString();
      });

      return textNode;
    };

    for (let i = 0, il = result.length; i < il; i++) {
      let item = result[i];
      if (isItemEmpty(item))
        continue;

      if (item instanceof Node) {
        if (item.nodeType === Node.ELEMENT_NODE) {
          this.insertRenderedItem(context, item);
        } else if (item.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
          let children = Array.from(item.childNodes);
          for (let j = 0, jl = children.length; j < jl; j++) {
            let child = children[j];
            this.insertRenderedResult(context, child);
          }
        } else if (item.nodeType === Node.TEXT_NODE) {
          this.insertRenderedItem(context, item);
        }
      } else if (Utils.isType(item, Utils.DynamicProperty)) {
        let textNode = createAndRegisterTextNode(item);
        this.insertRenderedItem(context, textNode);
      } else {
        let textNode = context.ownerDocument.createTextNode((typeof item.toString === 'function') ? item.toString() : ('' + item));
        this.insertRenderedItem(context, textNode);
      }
    }
  }

  render(items) {
    let template = this.itemTemplate && this.itemTemplate.cloneNode(true);
    if (!template)
      return;

    let renderedItems = this.clearRenderedItems();
    if (!items)
      return;

    let entries;
    if (typeof items.entries === 'function')
      entries = items.entries();
    else
      entries = Object.entries(items);

    let ownerDocument     = this.ownerDocument || document;
    let index             = 0;
    let forceNumberIndex  = Utils.isType(items, 'String', Set);

    for (let [ key, item ] of entries) {
      if (forceNumberIndex)
        key = index++;

      let context = {
        template,
        ownerDocument,
        items,
        renderedItems,
        key,
        item,
      };

      if (typeof this.doCallback === 'function')
        item = context.item = this.doCallback(context);

      let result = this.renderChild(context);
      this.insertRenderedResult(context, result);
    }
  }

  renderChild(context) {
    let { template } = context;
    return this.processElements(
      ((IS_TEMPLATE.test(template.tagName)) ? template.content : template).cloneNode(true),
      {
        forceTemplateEngine:  true,
        scope:                Utils.createScope(context, this),
      },
    );
  }

  set attr$do([ value ]) {
    // eslint-disable-next-line no-self-assign
    // Reassigning items to themselves triggers
    // and update
    if (!value) {
      this.doCallback = null;
      return;
    }

    this.doCallback = Utils.createTemplateMacro({ body: value, scope: Utils.createScope(this) });
  }

  set attr$of([ value ]) {
    let items = Utils.createTemplateMacro({ body: value, scope: Utils.createScope(this) })();

    if (Utils.isType(items, Utils.DynamicProperty)) {
      items.removeEventListener('update', this.onOfChange);
      items.addEventListener('update', this.onOfChange);

      this.items = items.valueOf();
    } else {
      this.items = items;
    }
  }
}

MythixUIForEach.register();
