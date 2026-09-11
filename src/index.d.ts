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

declare module '*?worker&inline' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module 'bash-parser';

interface Window {
  initAddedDCLightExercises: () => void;
  initDataCampLight: () => void;
  dcl: {
    bootElement: (element: HTMLElement) => void;
    getSettings: (element: HTMLElement) => any;
    init: () => void;
  };
}
