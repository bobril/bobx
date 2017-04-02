import * as b from 'bobril';
import { observable, observableProp } from '../index';

class State {
    @observable name = "";
    upperCasedName() {
        return this.name.toUpperCase();
    }
}

const state = new State();

b.addRoot(() => <div>
    <input value={observableProp(state, "name")} />
    <span> Uppercase: {state.upperCasedName()}</span>
</div>);
