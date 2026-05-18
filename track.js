
export const init = async (container) => {
  	const type = container.dataset.type;
  	const track_module = await import(`/tracks/${type}.js`);
  	return track_module.init(container);
};