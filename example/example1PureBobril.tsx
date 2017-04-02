import * as b from 'bobril';

const counter = b.propi(0);

setInterval(() => {
    counter(counter() + 1);
}, 2000);

b.addRoot(() => counter());
