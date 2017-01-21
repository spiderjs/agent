module.exports = {
    "env": {
        "browser": true,
        "commonjs": true,
        "node": true,
        "mocha": true,
        "es6": true
    },
    "plugins": ["node"],
    "extends": ["eslint:recommended", "plugin:node/recommended"],
    "parserOptions": {
        "sourceType": "module"
    },
    "globals": {
        "__dirname": true,
        "__filename": true,
        "describe": true,
        "it": true,
    },
    "rules": {

        "node/exports-style": ["error", "module.exports"],

        "indent": [
            "error",
            4,
            { "SwitchCase": 1 }
        ],
        "linebreak-style": [
            "off",
            "unix"
        ],
        "quotes": [
            "error",
            "single"
        ],
        "semi": [
            "error",
            "always"
        ]
    }
};