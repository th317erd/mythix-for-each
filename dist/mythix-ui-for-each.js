import { MythixUIComponent, Utils } from 'mythix-ui-core';

export default class MythixUIForEach extends MythixUIComponent {
  static tagName = 'mythix-for-each';

  constructor() {
    super();

    let _items = new Utils.DynamicProperty([]);
    Object.defineProperties(this, {
      'items': {
        enumerable:   false,
        configurable: true,
        get:          () => {
          return _items;
        },
        set:          (value) => {
          let items = value;
          if (Utils.isType(items, Utils.DynamicProperty, 'DynamicProperty'))
            items = items.valueOf();

          let changeEvent = new Event('change');
          changeEvent.oroginator = this;
          changeEvent.oldValue = this.items;
          changeEvent.value = items;

          this.dispatchEvent(changeEvent);
          if (changeEvent.defaultPrevented)
            return;

          _items._set(items);
          this.render(_items.valueOf());
        },
      },
    });
  }

  onOfChange({ value }) {
    this.items = value;
  }

  clearRenderedItems() {
    let shadow      = this.shadow;
    let childNodes  = (this.ownerDocument || document).createDocumentFragment();
    while (shadow.childNodes.length)
      childNodes.appendChild(shadow.childNodes[0]);

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

  insertRenderedItem(context, _item) {
    let item = _item;
    if (item.nodeType === Node.TEXT_NODE) {
      this.shadow.appendChild(item);
      return;
    }

    if (this.getAttribute('cache') !== 'false') {
      let {
        renderedItems,
      } = context;

      let itemID = item.getAttribute('id');
      if (!itemID) {
        let idItem = context.item;
        itemID = `ID${(Utils.isCollectable(idItem)) ? Utils.getObjID(item) : Utils.SHA256(idItem)}`;
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

    this.shadow.appendChild(item);

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
      } else if (Utils.isType(item, Utils.DynamicProperty, 'DynamicProperty')) {
        let textNode = createAndRegisterTextNode(item);
        this.insertRenderedItem(context, textNode);
      } else {
        let textNode = context.ownerDocument.createTextNode((typeof item.toString === 'function') ? item.toString() : ('' + item));
        this.insertRenderedItem(context, textNode);
      }
    }
  }

  createContextHelperProxy(context) {
    return new Proxy(context, {
      get: (target, propName) => {
        if (propName in target)
          return target[propName];

        return this.$$.propName;
      },
    });
  }

  render(items) {
    let renderedItems = this.clearRenderedItems();
    if (!items)
      return;

    let entries;
    if (typeof items.entries === 'function')
      entries = items.entries();
    else
      entries = Object.entries(items);

    let ownerDocument = this.ownerDocument || document;
    let template      = ownerDocument.createDocumentFragment();
    for (let i = 0, il = this.childNodes.length; i < il; i++) {
      let node = this.childNodes[i];
      template.appendChild(node.cloneNode(true));
    }

    let forceNumberIndex  = Utils.isType(items, 'String', Set);
    let index             = 0;
    let context           = this.createContextHelperProxy({
      template,
      ownerDocument,
      items,
      renderedItems,
    });

    for (let [ key, item ] of entries) {
      if (forceNumberIndex)
        key = index++;

      context.key = key;
      context.item = item;

      if (typeof this.doCallback === 'function')
        item = context.item = this.doCallback(context);

      let result = this.renderChild(context);
      this.insertRenderedResult(context, result);
    }
  }

  renderChild(context) {
    let { template } = context;
    return this.processElements(
      template.cloneNode(true),
      {
        forceTemplateEngine:  true,
        scopes:               [ context ],
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

    this.doCallback = Utils.createContextAwareCallback({ body: value, scopes: [ this ] });
  }

  set attr$of([ value ]) {
    let items = Utils.createContextAwareCallback({ body: value, scopes: [ this ] })();

    if (Utils.isType(items, Utils.DynamicProperty, 'DynamicProperty')) {
      items.removeEventListener('update', this.onOfChange);
      items.addEventListener('update', this.onOfChange);

      this.items = items.valueOf();
    } else {
      this.items = items;
    }
  }
}

MythixUIForEach.register();
