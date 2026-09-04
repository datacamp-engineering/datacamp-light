declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.py?raw' {
  const content: string;
  export default content;
}

declare module '*.py' {
  const content: string;
  export default content;
}

interface Window {
  initAddedDCLightExercises: () => void;
  initDataCampLight: () => void;
  dcl: {
    bootElement: (element: HTMLElement) => void;
    getSettings: (element: HTMLElement) => any;
    init: () => void;
  };
}
