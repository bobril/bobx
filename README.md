# BobX

MobX like library for Bobril

[![npm version](https://badge.fury.io/js/bobx.svg)](https://badge.fury.io/js/bobx)

Changelog: https://github.com/Bobril/BobX/blob/master/CHANGELOG.md

install from npm:

	npm install bobx --save

Danger: It is in very early development.

Minimal example:

	import * as b from 'bobril';
	import { observable } from 'bobx';

	const counter = observable(0);

	setInterval(() => {
		counter.set(counter.get() + 1);
	}, 2000);

	b.init(() => counter.get());
