export const imageTools = [
  {
    type: 'function' as const,
    function: {
      name: 'create_image',
      description:
        'Generate a new image from a text prompt using HiDream-O1-Image. ' +
        'Use this when the user wants to create, generate, or draw a new image from text only (no reference images).',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed English description of the image to generate. ' +
              'Include subject, composition, lighting, style, camera angle, and any text to render.',
          },
          width: {
            type: 'number',
            description: 'Image width in pixels (default 2048, must be multiple of 64, min 512)',
          },
          height: {
            type: 'number',
            description: 'Image height in pixels (default 2048, must be multiple of 64, min 512)',
          },
          seed: {
            type: 'number',
            description: 'Random seed for reproducibility (default 32)',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_image',
      description:
        'Edit a single existing image based on a text instruction. ' +
        'Use this when the user wants to modify, transform, restyle, or edit ONE image they have provided. ' +
        'The user\'s attached image is used automatically — you do not need to pass image data.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed English description of the desired edit result. ' +
              'Describe the final image after editing, not the editing action itself.',
          },
          width: {
            type: 'number',
            description: 'Output image width in pixels (default 2048)',
          },
          height: {
            type: 'number',
            description: 'Output image height in pixels (default 2048)',
          },
          seed: {
            type: 'number',
            description: 'Random seed (default 32)',
          },
          keep_original_aspect: {
            type: 'boolean',
            description: 'Preserve the reference image aspect ratio (default false)',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'subject_driven_image',
      description:
        'Generate a new image using multiple reference images for subject-driven personalization. ' +
        'Use this when the user attaches 2-6 images and wants to generate a new image featuring the same subject(s). ' +
        'The user\'s attached images are used automatically — you do not need to pass image data.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed English description of the desired output image. ' +
              'Describe the scene, pose, lighting, style, and composition for the new image.',
          },
          width: {
            type: 'number',
            description: 'Output image width in pixels (default 2048)',
          },
          height: {
            type: 'number',
            description: 'Output image height in pixels (default 2048)',
          },
          seed: {
            type: 'number',
            description: 'Random seed (default 32)',
          },
        },
        required: ['prompt'],
      },
    },
  },
]
