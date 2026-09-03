declare module '*.svg' {
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
