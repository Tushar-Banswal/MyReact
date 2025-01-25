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

    static #createTextElement(child) {
        return {
            type: "TEXT_ELEMENT",
            props: {
                nodeValue: child,
                children: [],
            },
        };
    }

    static #createDomNode(fiber) {
        const node =
            fiber.type === "TEXT_ELEMENT"
                ? document.createTextNode("")
                : document.createElement(fiber.type || "div");

        MyReact.#updateDomNode(node, fiber.props, {});

        return node;
    }

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

        requestIdleCallback(MyReact.#workLoop);
    }

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

        requestIdleCallback(MyReact.#workLoop);
    }

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
        } else if (fiber.effectiveTag === "UPDATE" && fiber.node) {
            MyReact.#updateDomNode(fiber.node, fiber.props, fiber.alternate.props);
        }

        MyReact.#commitWork(fiber.child);
        MyReact.#commitWork(fiber.sibling);
    }

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

    static #updateHostComponent(fiber) {
        if (!fiber.node) {
            fiber.node = MyReact.#createDomNode(fiber);
        }
        MyReact.#wipFiber = fiber;
        MyReact.#wipFiber.hooks = [];
        MyReact.#hookIndex = 0;
        const { children = [] } = fiber.props;
        MyReact.#reconcileChildren(fiber, children);
    }

    static #updateFunctionalComponent(fiber) {
        const children = [fiber.type(fiber.props)];
        MyReact.#reconcileChildren(fiber, children);
    }

    static useState(initialValue) {
        const oldHook = MyReact.#wipFiber 
            && MyReact.#wipFiber.alternate
            && MyReact.#wipFiber.alternate.hooks 
            && MyReact.#wipFiber.alternate.hooks[MyReact.#hookIndex];

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
}

export default MyReact;
