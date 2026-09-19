import h, {Solarite} from '../../dist/Solarite.min.js';

class ShoppingList extends Solarite {
  items = [
    {name: 'Apples'},
    {name: 'Bananas'},
    {name: 'Carrots'}];

  add() {
    this.items.push({name: ''});
    this.render();
  }

  render() {
    h(this)`
    <shopping-list oninput=${this.render}>
      <h3>Today’s essentials</h3>
      ${this.items.map(item => h`
        <label>
          <input type="checkbox" checked=${[item, 'done']}>
          <input value=${[item, 'name']}>
        </label>`
      )}
      <button onclick=${this.add}>+ Add an item</button>
      <pre>${JSON.stringify(this.items)}</pre>
    </shopping-list>`;
  }
}
document.body.append(new ShoppingList());
