var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src\App.svelte generated by Svelte v3.23.0 */

    function create_fragment(ctx) {
    	let main;
    	let div0;
    	let t1;
    	let div1;
    	let label0;
    	let t3;
    	let input0;
    	let t4;
    	let div4;
    	let div2;
    	let label1;
    	let t6;
    	let input1;
    	let t7;
    	let div3;
    	let t8;
    	let t9;
    	let t10;
    	let div7;
    	let div5;
    	let label2;
    	let t12;
    	let input2;
    	let t13;
    	let div6;
    	let t14_value = /*interestrate*/ ctx[3].toFixed(2) + "";
    	let t14;
    	let t15;
    	let t16;
    	let div8;
    	let t17;
    	let t18_value = /*formatter*/ ctx[7].format(/*monthlypayment*/ ctx[4]) + "";
    	let t18;
    	let t19;
    	let div9;
    	let t20;
    	let t21_value = /*formatter*/ ctx[7].format(/*totalpaid*/ ctx[5]) + "";
    	let t21;
    	let t22;
    	let div10;
    	let t23;
    	let t24_value = /*formatter*/ ctx[7].format(/*interestpaid*/ ctx[6]) + "";
    	let t24;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			main = element("main");
    			div0 = element("div");
    			div0.innerHTML = `<h1> Mortgage Calculator </h1>`;
    			t1 = space();
    			div1 = element("div");
    			label0 = element("label");
    			label0.textContent = "Loan Amount";
    			t3 = space();
    			input0 = element("input");
    			t4 = space();
    			div4 = element("div");
    			div2 = element("div");
    			label1 = element("label");
    			label1.textContent = "years";
    			t6 = space();
    			input1 = element("input");
    			t7 = space();
    			div3 = element("div");
    			t8 = text(/*years*/ ctx[0]);
    			t9 = text(" years");
    			t10 = space();
    			div7 = element("div");
    			div5 = element("div");
    			label2 = element("label");
    			label2.textContent = "Interest Rate";
    			t12 = space();
    			input2 = element("input");
    			t13 = space();
    			div6 = element("div");
    			t14 = text(t14_value);
    			t15 = text(" %");
    			t16 = space();
    			div8 = element("div");
    			t17 = text("Monthly Payments ");
    			t18 = text(t18_value);
    			t19 = space();
    			div9 = element("div");
    			t20 = text("Total Paid ");
    			t21 = text(t21_value);
    			t22 = space();
    			div10 = element("div");
    			t23 = text("Interest Paid ");
    			t24 = text(t24_value);
    			attr(div0, "class", "row");
    			attr(input0, "min", "1");
    			attr(input0, "placeholder", /*loanamount*/ ctx[1]);
    			attr(input0, "type", "number");
    			attr(input0, "class", "u-full-width");
    			attr(div1, "class", "row");
    			attr(input1, "type", "range");
    			attr(input1, "min", "1");
    			attr(input1, "max", "50");
    			attr(input1, "class", "u-full-width");
    			attr(div2, "class", "columns six");
    			attr(div3, "class", "columns six outputs svelte-7w1iaq");
    			attr(div4, "class", "row");
    			attr(input2, "type", "range");
    			attr(input2, "min", "1");
    			attr(input2, "max", "2000");
    			attr(input2, "class", "u-full-width");
    			attr(div5, "class", "columns six");
    			attr(div6, "class", "columns six outputs svelte-7w1iaq");
    			attr(div7, "class", "row");
    			attr(div8, "class", "row outputs svelte-7w1iaq");
    			attr(div9, "class", "row outputs svelte-7w1iaq");
    			attr(div10, "class", "row outputs svelte-7w1iaq");
    			attr(main, "class", "container");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, div0);
    			append(main, t1);
    			append(main, div1);
    			append(div1, label0);
    			append(div1, t3);
    			append(div1, input0);
    			set_input_value(input0, /*loanamount*/ ctx[1]);
    			append(main, t4);
    			append(main, div4);
    			append(div4, div2);
    			append(div2, label1);
    			append(div2, t6);
    			append(div2, input1);
    			set_input_value(input1, /*years*/ ctx[0]);
    			append(div4, t7);
    			append(div4, div3);
    			append(div3, t8);
    			append(div3, t9);
    			append(main, t10);
    			append(main, div7);
    			append(div7, div5);
    			append(div5, label2);
    			append(div5, t12);
    			append(div5, input2);
    			set_input_value(input2, /*interestrateinput*/ ctx[2]);
    			append(div7, t13);
    			append(div7, div6);
    			append(div6, t14);
    			append(div6, t15);
    			append(main, t16);
    			append(main, div8);
    			append(div8, t17);
    			append(div8, t18);
    			append(main, t19);
    			append(main, div9);
    			append(div9, t20);
    			append(div9, t21);
    			append(main, t22);
    			append(main, div10);
    			append(div10, t23);
    			append(div10, t24);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*input0_input_handler*/ ctx[10]),
    					listen(input1, "change", /*input1_change_input_handler*/ ctx[11]),
    					listen(input1, "input", /*input1_change_input_handler*/ ctx[11]),
    					listen(input2, "change", /*input2_change_input_handler*/ ctx[12]),
    					listen(input2, "input", /*input2_change_input_handler*/ ctx[12])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*loanamount*/ 2) {
    				attr(input0, "placeholder", /*loanamount*/ ctx[1]);
    			}

    			if (dirty & /*loanamount*/ 2 && to_number(input0.value) !== /*loanamount*/ ctx[1]) {
    				set_input_value(input0, /*loanamount*/ ctx[1]);
    			}

    			if (dirty & /*years*/ 1) {
    				set_input_value(input1, /*years*/ ctx[0]);
    			}

    			if (dirty & /*years*/ 1) set_data(t8, /*years*/ ctx[0]);

    			if (dirty & /*interestrateinput*/ 4) {
    				set_input_value(input2, /*interestrateinput*/ ctx[2]);
    			}

    			if (dirty & /*interestrate*/ 8 && t14_value !== (t14_value = /*interestrate*/ ctx[3].toFixed(2) + "")) set_data(t14, t14_value);
    			if (dirty & /*monthlypayment*/ 16 && t18_value !== (t18_value = /*formatter*/ ctx[7].format(/*monthlypayment*/ ctx[4]) + "")) set_data(t18, t18_value);
    			if (dirty & /*totalpaid*/ 32 && t21_value !== (t21_value = /*formatter*/ ctx[7].format(/*totalpaid*/ ctx[5]) + "")) set_data(t21, t21_value);
    			if (dirty & /*interestpaid*/ 64 && t24_value !== (t24_value = /*formatter*/ ctx[7].format(/*interestpaid*/ ctx[6]) + "")) set_data(t24, t24_value);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(main);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	var formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    	let years = 15;
    	let loanamount = 500000;
    	let interestrateinput = 200;

    	function input0_input_handler() {
    		loanamount = to_number(this.value);
    		$$invalidate(1, loanamount);
    	}

    	function input1_change_input_handler() {
    		years = to_number(this.value);
    		$$invalidate(0, years);
    	}

    	function input2_change_input_handler() {
    		interestrateinput = to_number(this.value);
    		$$invalidate(2, interestrateinput);
    	}

    	let interestrate;
    	let totalpayments;
    	let monthlyinterestrate;
    	let monthlypayment;
    	let totalpaid;
    	let interestpaid;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*interestrateinput*/ 4) {
    			 $$invalidate(3, interestrate = interestrateinput / 100);
    		}

    		if ($$self.$$.dirty & /*years*/ 1) {
    			 $$invalidate(8, totalpayments = years * 12);
    		}

    		if ($$self.$$.dirty & /*interestrate*/ 8) {
    			 $$invalidate(9, monthlyinterestrate = interestrate / 100 / 12);
    		}

    		if ($$self.$$.dirty & /*loanamount, monthlyinterestrate, totalpayments*/ 770) {
    			 $$invalidate(4, monthlypayment = loanamount * Math.pow(1 + monthlyinterestrate, totalpayments) * monthlyinterestrate / (Math.pow(1 + monthlyinterestrate, totalpayments) - 1));
    		}

    		if ($$self.$$.dirty & /*monthlypayment, totalpayments*/ 272) {
    			 $$invalidate(5, totalpaid = monthlypayment * totalpayments);
    		}

    		if ($$self.$$.dirty & /*totalpaid, loanamount*/ 34) {
    			 $$invalidate(6, interestpaid = totalpaid - loanamount);
    		}
    	};

    	return [
    		years,
    		loanamount,
    		interestrateinput,
    		interestrate,
    		monthlypayment,
    		totalpaid,
    		interestpaid,
    		formatter,
    		totalpayments,
    		monthlyinterestrate,
    		input0_input_handler,
    		input1_change_input_handler,
    		input2_change_input_handler
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
