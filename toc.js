
const createHeadingsTree = (rootElement) => {
	const headings = rootElement.querySelectorAll('h1, h2, h3, h4');
	const headingsTree = [];
	
	let currentNode = null;
	let previousNode = { level: 0, children: headingsTree };

	headings.forEach((heading) => {
		heading.id = heading.innerText.replace(/\s+/g, '-').toLowerCase();
		const level = parseInt(heading.tagName.charAt(1));
		const newNode = {
			text: heading.textContent,
			children: []
		};
		if (!currentNode || level > previousNode.level) {
			previousNode.children.push(newNode);
			newNode.parent = previousNode;
			currentNode = newNode;
		} else {
			while (currentNode && level <= currentNode.parent.level) {
				currentNode = currentNode.parent;
			}
			currentNode.parent.children.push(newNode);
			newNode.parent = currentNode.parent;
			currentNode = newNode;
		}
		previousNode = newNode;
		newNode.level = level;
	});
	return headingsTree;
};

const createTableOfContents = (headingsTree, parentElement) => {
	const ol = document.createElement('ol');
	headingsTree.forEach((heading) => {
		const li = document.createElement('li');
		const a = document.createElement('a');
		a.textContent = heading.text;
		a.href = `#${heading.text.replace(/\s+/g, '-').toLowerCase()}`;
		li.appendChild(a);
		if (heading.children.length > 0)
			createTableOfContents(heading.children, li);
		ol.appendChild(li);
	});
	if (parentElement)
		parentElement.appendChild(ol);
	else
		return ol;
};

const initTOC = () => {
	const toc = document.querySelector('.toc .guide');
	const text_elem = document.querySelector('.text');
	const headings = createHeadingsTree(text_elem);
	createTableOfContents(headings, toc);
};

window.addEventListener('load', async () => {
	initTOC();
});