<p align="center">
	<img src="https://github.com/appcelerator/titanium-es/raw/master/README/es.png" height="128 " width="128">
	<h1 align="center">titanium-es</h1>
	<h5 align="center">Generates a modern ECMAScript wrapper for Titanium API</h6>
</p>

### Generate Wrappers
```
node . <path/to/api.jsca>
```

#### Example
```JS
import UI from 'Titanium/UI';
const { Window, Label, View, Animation, Matrix2D } = UI;

const window = new Window({
    title: 'Titanium-ECMAScript',
    layout: 'vertical',
    backgroundColor: 'gray'
});
const label = new Label({
    color: 'white',
    font: {
        fontSize: '32'
    },
    text: 'Titanium-ECMAScript!'
});
const view = new View({
    backgroundColor: 'red',
    width: 100,
    height: 100
});
const matrix = new Matrix2D({
    rotate: 90
});
const animation = new Animation({
    transform: matrix,
    duration: 3000
});

window.addEventListener('open', async _ => {
    try {
        await view.animate(animation);

        view.backgroundColor = 'orange';
        alert('DONE ANIMATION!');
    } catch (e) {
        console.error(e);
    }
});

window.add([ label, view ]);
window.open();
```