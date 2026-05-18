
async def run_analysis(options):
    import allel
    import math
    def non_negative_mean(array, axis=0):
        a = np.sum(np.maximum(array, 0), axis=axis) / np.sum(array >= 0, axis=axis)
        return a
    def convert_counts_to_ploidy(counts_array):
        ploidy_array = np.zeros(counts_array.shape + (2,), dtype=np.int8)
        ploidy_array[counts_array == -1] = [-1, -1]
        ploidy_array[counts_array == 1] = [1, 0]
        ploidy_array[counts_array == 2] = [1, 1]
        return ploidy_array
    def tajima_d(alleles):
        # Convert genotype matrix to allele counts
        ac = allel.GenotypeArray(convert_counts_to_ploidy(alleles.T)).count_alleles()
        # Calculate Tajima's D
        taj_d = allel.tajima_d(ac, pos=None)
        return np.nanmean(taj_d)  # Average across genome
    subsets = options.get('subsets', [])
    variant_indices = options.get('variant_indices', [])
    variant_threshold = float(options.get('variant_threshold', 0))
    sample_threshold = float(options.get('sample_threshold', 0))
    results = []
    for samples in subsets:
        if len(samples) == 0:
            results.append({'value': 0, 'samples': 0})
            continue
        
        # Read alleles and apply filters
        alleles = await read_samples(options['bed_prefix'], samples, variant_indices)
        variants_nodata = np.sum(alleles == -1, axis=0) / alleles.shape[0]
        variants_filtered_out = variants_nodata >= (1 - variant_threshold)
        alleles = alleles[:, ~variants_filtered_out]
        
        samples_nodata = np.sum(alleles == -1, axis=1) / alleles.shape[1]
        samples_filtered_out = samples_nodata >= (1 - sample_threshold)
        alleles = alleles[~samples_filtered_out]
        
        # Calculate Tajima's D
        taj_d = tajima_d(alleles)
        
        results.append({
            'value': 0 if math.isnan(taj_d) else taj_d,
            'samples': 0 if math.isnan(taj_d) else alleles.shape[0],
            'variants': 0 if math.isnan(taj_d) else alleles.shape[1]
        })
    return results

def Tajimas_D(options, results):
    ax = fig.add_subplot(111)
    ax.set_xlabel('Years ago', fontsize=14)
    ax.set_ylabel('Tajima\'s D', fontsize=14)
   
    x = np.array(options['temporal_windows']) if 'temporal_windows' in options else np.arange(*[int(year) for year in options['years'].split('-')], int(options['step']))

    output = [['Region', 'Temporal window', 'Tajima\'s D', 'Coverage (samples)']]

    genotype_line_styles = ['solid', 'dashed', 'dotted']

    for result_i, genotype_results in enumerate(results):
        genotype_results = np.array(genotype_results)
        genotype_results = genotype_results.reshape(int(genotype_results.shape[0] / len(x)), len(x))
        for region_i, result in enumerate(genotype_results):
            coverage = np.array([point['samples'] if 'samples' in point else 0 for point in result])
            y = np.array([point['value'] if 'value' in point else 0 for point in result])
            has_data = coverage > 0
            label = f"{options['regions'][region_i]['label']}, {options['genotypes'][result_i].replace('/data/', '').replace('/public/', '')}" if len(options['genotypes']) > 1 else f"{options['regions'][region_i]['label']}"
            ax.plot(x[has_data], y[has_data], color=[int(c) / 255 for c in options['regions'][region_i]['color'].split(',')], linestyle=genotype_line_styles[result_i], label=label)
            ax.scatter(x[has_data], y[has_data], color=[int(c) / 255 for c in options['regions'][region_i]['color'].split(',')])
            output.extend([[label, x[i], y[i], coverage[i]] for i in range(len(x))])
    ylim_max = np.ceil(10 * ax.get_ylim()[1]) / 10
    ax.set_ylim([0, ylim_max])
    ax.set_xticks(x)
    ax.set_yticks(np.linspace(0, ylim_max, 5))
    plt.legend(loc='best', fontsize=14)
    return output