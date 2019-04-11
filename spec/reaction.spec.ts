import * as b from "bobril";
import { reaction, observable } from "../index";

describe("reaction", () => {
    it("runs immediately", () => {
        let count = 0;
        const r = reaction(
            () => "a",
            value => {
                count++;
                expect(value).toBe("a");
            }
        );
        expect(count).toBe(0);
        b.syncUpdate();
        expect(count).toBe(1);
        r.dispose();
    });

    it("observe value", () => {
        let count = 0;
        const o = observable({ v: 0 });
        let last: number | undefined;
        const r = reaction(
            () => o.v,
            value => {
                count++;
                last = value;
            }
        );
        b.syncUpdate();
        expect(count).toBe(1);
        expect(last).toBe(0);
        b.syncUpdate();
        expect(count).toBe(1);
        o.v = 1;
        b.syncUpdate();
        expect(count).toBe(2);
        expect(last).toBe(1);
        o.v = 2;
        o.v = 1;
        b.syncUpdate();
        expect(count).toBe(2);
        expect(last).toBe(1);
        r.dispose();
    });
});
