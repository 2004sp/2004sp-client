interface Window {
    SERVER_HOST?: string;
    SERVER_SECURED?: boolean;
    AUTO_START_CLIENT?: boolean;
    CLIENT_LOW_MEMORY?: boolean;
    setClientLowMemoryMode?: (enabled: boolean) => void;
}
