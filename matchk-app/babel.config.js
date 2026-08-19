module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: { '@': './src' },
          extensions: ['.ios.js', '.android.js', '.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      ],
      // react-native-reanimated 플러그인은 반드시 plugins 배열의 마지막에 위치해야 함
      // (공식 요구사항 — 드래그앤드롭 기능(react-native-draggable-flatlist)이 내부적으로 사용) -- 호환성문제로잠깐보류
    ],
  };
};
