class MyReact {
    static #deletions = [];
    static #currentRoot = null;
    static #wipRoot = null;
    static #nextUnitOfWork = null;
    static #wipFiber = null;
    static #hookIndex = null;

    static isProperty = (key) => key !== "children";
    static isNewOrChanged = (prevProps, newProps) => (key) => newProps[key] !== prevProps[key];
    static isGone = (newProps) => (key) => !(key in newProps);
    static isEvent = (key) => key.startsWith("on");

    /**
     * Create a virtual DOM of the JSX.
     * @param {string} type Type of DOM node
     * @param {Object} props Attributes of DOM node
     * @param  {Array} children Children of the DOM node
     * @returns {Object} Virtual DOM representation of JSX
     */
    static createElement(type, props, ...children) {
        return {
            type,
            props: {
                ...props,
                children: children.map((child) => {
                    if (typeof child === "object") {
                        return child;
                    } else {
                        return MyReact.#createTextElement(child);
                    }
                }),
            },
        };
    }

    /**
     * Create a virtual DOM of the eext Element
     * @param {string} value text rLement
     * @returns {Object} Virtual DOM of the text element
     */
    static #createTextElement(value) {
        return {
            type: "TEXT_ELEMENT",
            props: {
                nodeValue: value,
                children: [],
            },
        };
    }

    /**
     * Create a DOM from the virtual DOM
     * @param {Object} fiber Fiber node
     * @returns DOM node
     */
    static #createDomNode(fiber) {
        const node =
            fiber.type === "TEXT_ELEMENT"
                ? document.createTextNode("")
                : document.createElement(fiber.type || "div");

        MyReact.#updateDomNode(node, fiber.props, {});

        return node;
    }

    /**
     * Renders the virtual DOM
     * @param {*} element Virtual DOM Element
     * @param {*} container DOM Container
     */
    static render(element, container) {
        MyReact.#wipRoot = {
            node: container,
            props: {
                children: [element],
            },
            parent: null,
            alternate: MyReact.#currentRoot,
        };
        MyReact.#nextUnitOfWork = MyReact.#wipRoot;

        // calling when the thread is idle
        requestIdleCallback(MyReact.#workLoop);
    }

    /**
     * Callback to requestIdleCallback browser api, calls when the browser thread is idle.
     * @param {Object} deadline idle time left
     */
    static #workLoop(deadline) {
        let shouldContinue = true;

        while (MyReact.#nextUnitOfWork && shouldContinue) {
            MyReact.#nextUnitOfWork = MyReact.#performNextUnitOfWork(MyReact.#nextUnitOfWork);
            shouldContinue = deadline.timeRemaining() >= 1;
        }

        if (!MyReact.#nextUnitOfWork && MyReact.#wipRoot) {
            MyReact.#deletions.forEach(MyReact.#commitWork); // remove deletion nodes from DOM
            MyReact.#commitWork(MyReact.#wipRoot.child); // commit the nodes to DOM
            MyReact.#currentRoot = MyReact.#wipRoot;
            MyReact.#wipRoot = null;
        }

        // calling again when the thread is idle
        requestIdleCallback(MyReact.#workLoop);
    }

    /**
     * This function perform three tasks:-
     * 1.Create DOM node for the current fiber node
     * 2.Create a fiber node for the current fiber node's children
     * 3.Return the next fiber node as next work to perform
     * @param {Object} fiber current unit of work
     * @returns next unit of work
     */
    static #performNextUnitOfWork(fiber) {
        const isFunctionalComponent = typeof fiber.type === 'function';
        if (isFunctionalComponent) {
            MyReact.#updateFunctionalComponent(fiber);
        } else {
            MyReact.#updateHostComponent(fiber);
        }

        if (fiber.child) {
            return fiber.child;
        } else {
            let nextFiber = fiber;
            while (nextFiber) {
                if (nextFiber.sibling) {
                    return nextFiber.sibling;
                }
                nextFiber = nextFiber.parent;
            }
        }
    }

    /**
     * Commit the Fiber tree
     * @param {Object} fiber Fiber tree
     */
    static #commitWork(fiber) {
        if (!fiber) {
            return;
        }
        let parentFiber = fiber.parent;
        // finding fiber with DOM node to append
        while(!parentFiber.node) {
            parentFiber = parentFiber.parent;
        }
        const parentNode = parentFiber.node;

        if (fiber.effectiveTag === "ADD" && fiber.node) {
            parentNode.appendChild(fiber.node);
        } else if (fiber.effectiveTag === "DELETE") {
            // finding fiber with DOM node to remove
            const deleteFiber = fiber;
            while(!deleteFiber.node) {
                deleteFiber = fiber.child;
            }
            parentNode.removeChild(deleteFiber.node);
            // calling side effects cleanup on unmounting
            fiber.hooks.forEach(hook => {
                if(hook.callSideEffectCleanUp) {
                    hook.sideEffectCleanUp();
                }
            })

            return;
        } else if (fiber.effectiveTag === "UPDATE" && fiber.node) {
            MyReact.#updateDomNode(fiber.node, fiber.props, fiber.alternate.props);
        }

        // calling side effect on mounting
        fiber.hooks && fiber.hooks.forEach(hook => {
            if(hook.callSideEffect) {
                hook.sideEffectCleanUp = hook.sideEffect();
                hook.callSideEffectCleanUp = true;
            }
        })
        MyReact.#commitWork(fiber.child);
        MyReact.#commitWork(fiber.sibling);
    }

    /**
     * Fiber Reconsillation Algorithm
     * Resolve which child node need to get 'UPDATE', 'ADD', or 'DELETE'
     * @param {*} fiber Fiber node
     * @param {*} children Fiber node's Children
     */
    static #reconcileChildren(fiber, children) {
        let index = 0;
        let oldChildFiber = fiber.alternate && fiber.alternate.child;
        let prevSibling = null;

        while (index < children.length || oldChildFiber) {
            const child = children[index];
            const sameType = child && oldChildFiber && child.type === oldChildFiber.type;
            let newFiber = null;
            if (sameType) {
                newFiber = {
                    type: oldChildFiber.type,
                    props: child.props,
                    node: oldChildFiber.node,
                    parent: fiber,
                    alternate: oldChildFiber,
                    effectiveTag: "UPDATE",
                };
            }
            if (child && !sameType) {
                newFiber = {
                    type: child.type,
                    props: child.props,
                    node: null,
                    parent: fiber,
                    alternate: null,
                    effectiveTag: "ADD",
                };
            }

            if (oldChildFiber && !sameType) {
                oldChildFiber.effectiveTag = "DELETE";
                MyReact.#deletions.push(oldChildFiber);
            }

            if (oldChildFiber) {
                oldChildFiber = oldChildFiber.sibling;
            }

            if (index === 0) {
                fiber.child = newFiber;
            } else {
                prevSibling.sibling = newFiber;
            }

            prevSibling = newFiber;
            index++;
        }
    }

    /**
     * Update's the DOM node
     * 1.Add the new Attributes
     * 2.Remove old Attributes
     * 3.Add new Events
     * 4.Remove new Events
     * @param {Object} node DOM node
     * @param {Object} newProps new Properties
     * @param {Object} prevProps old Properties
     */
    static #updateDomNode(node, newProps, prevProps) {
        const oldProperties = Object.keys(prevProps)
            .filter(MyReact.isProperty)
            .filter(MyReact.isGone(newProps));

        const newOrChangedProperties = Object.keys(newProps)
            .filter(MyReact.isProperty)
            .filter(MyReact.isNewOrChanged(prevProps, newProps));

        const newOrChangedEvents = Object.keys(newProps)
            .filter(MyReact.isEvent)
            .filter(MyReact.isNewOrChanged(prevProps, newProps));

        const oldEvents = Object.keys(prevProps)
            .filter(MyReact.isEvent)
            .filter(
                (event) =>
                    !(event in newProps) ||
                    MyReact.isNewOrChanged(prevProps, newProps)(event)
            );

        // remove old or changed events handlers
        oldEvents.forEach((event) => {
            const eventType = event.toLowerCase().substring(2);
            node.removeEventListener(eventType, prevProps[event]);
        });

        // remove old props
        oldProperties.forEach((prop) => (node[prop] = ""));

        // add or update props;
        newOrChangedProperties.forEach((prop) => (node[prop] = newProps[prop]));

        // add event handlers
        newOrChangedEvents.forEach((event) => {
            const eventType = event.toLowerCase().substring(2);
            node.addEventListener(eventType, newProps[event]);
        });
    }

    /**
     * Update the fiber nodes
     * @param {Object} fiber Fiber node
     */
    static #updateHostComponent(fiber) {
        if (!fiber.node) {
            fiber.node = MyReact.#createDomNode(fiber);
        }
        const { children = [] } = fiber.props;
        MyReact.#reconcileChildren(fiber, children);
    }

    /**
     * Update Functional Components
     * @param {*} fiber Fiber node 
     */
    static #updateFunctionalComponent(fiber) {
        MyReact.#wipFiber = fiber;
        MyReact.#wipFiber.hooks = [];
        MyReact.#hookIndex = 0;
        const children = [fiber.type(fiber.props)];
        MyReact.#reconcileChildren(fiber, children);
    }

    /**
     * Hook to manage funcitonal components state
     * @param {*} initialValue initial state value
     * @returns {Array} Contains state and function to update state
     */
    static useState(initialValue) {
        const oldHook = MyReact.#getOldHook();

        const hook = {
            state: oldHook ? oldHook.state : initialValue, actionQueue: []
        };

        const actions = oldHook ? oldHook.actionQueue : [];
        actions.forEach(action => hook.state = action(hook.state));

        function setState(newState) {
            if(typeof newState !==  'function') {
                newState = (prevState) => newState;
            }

            hook.actionQueue.push(newState);
            MyReact.#wipRoot = {
                node: MyReact.#currentRoot.node,
                props: { ...MyReact.#currentRoot.props },
                parent: null,
                alternate: MyReact.#currentRoot,
            }
            MyReact.#nextUnitOfWork = MyReact.#wipRoot;
            MyReact.#deletions = [];
        }

        MyReact.#wipFiber.hooks.push(hook);
        MyReact.#hookIndex++;

        return [hook.state, setState]
    }

    /**
     * Hook to have side effects
     * @param {Function} callback side effect
     * @param {Array} dependencyArray Dependices for the side effect
     */
    static useEffect(callback, dependencyArray) {
        const oldHook = MyReact.#getOldHook();

        const oldDependencies = oldHook ? oldHook.dependencies : [];
        const isChanged = MyReact.#diffCheck(oldDependencies, dependencyArray);

        const hook = {
            dependencies : [...dependencyArray],
            sideEffect: callback,
            callSideEffect: isChanged,
            sideEffectCleanUp: null,
            callSideEffectCleanUp: null
        }

        MyReact.#wipFiber.hooks.push(hook);
        MyReact.#hookIndex++;
    }

    /**
     * Get the previous virtual Fiber dom hook
     * @returns hook
     */
    static #getOldHook() {
        return MyReact.#wipFiber 
            && MyReact.#wipFiber.alternate
            && MyReact.#wipFiber.alternate.hooks 
            && MyReact.#wipFiber.alternate.hooks[MyReact.#hookIndex];
    }

    /**
     * Checks if the dependcies are different
     * @param {*} oldDependencies old dependencies
     * @param {*} newDependencies new dependencies
     * @returns {Boolean} true if different false otherwise
     */
    static #diffCheck(oldDependencies, newDependencies) {
        if (oldDependencies.length !== newDependencies.length) {
            return true;
        }
        for (let index = 0; index < newDependencies.length; index++) {
            const isEqual = typeof oldDependencies[index] == typeof newDependencies[index]
                && oldDependencies[index] === newDependencies[index]
            if (!isEqual) {
                return true;
            }
        }
        return false;
    }
}

export default MyReact;
