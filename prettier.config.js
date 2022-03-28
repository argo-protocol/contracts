// prettier.config.js or .prettierrc.js
module.exports = {
    trailingComma: "es5",
    tabWidth: 4,
    semi: true,
    singleQuote: false,
    bracketSpacing: true,
    printWidth: 120,
    overrides: [
        {
            files: "*.{json,yml}",
            options: {
                tabWidth: 2,
            },
        },
        {
            files: "*.sol",
            options: {
                explicitTypes: "preserve",
            },
        },
    ],
};
